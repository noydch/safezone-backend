const prisma = require('../config/prisma');

/**
 * 📌 CREATE PURCHASE ORDER
 * สร้างใบสั่งซื้อใหม่ โดยอ้างอิงจากหน่วยที่สั่งซื้อ (ProductUnit)
 * @param {object} req.body - { supplierId: number, details: [{ productUnitId: number, quantity: number, price: number }] }
 */
exports.createPurchaseOrder = async (req, res) => {
    const { supplierId, details } = req.body;
    // console.log(req.body);

    // --- Validation ---
    if (!supplierId || !details || !Array.isArray(details) || details.length === 0) {
        return res.status(400).json({ message: "Supplier ID and order details are required." });
    }

    // ✨ ตรวจสอบว่า `details` มี `productUnitId` และข้อมูลครบถ้วน
    for (const item of details) {
        console.log(item);
        if (!item.productUnitId || !item.quantity || item.quantity <= 0 || item.price === undefined || item.price < 0) {
            return res.status(400).json({ message: `Invalid detail item: ${JSON.stringify(item)}. Ensure productUnitId, positive quantity, and non-negative price are provided.` });
        }
    }

    try {
        // --- Transaction ---
        const newPurchaseOrder = await prisma.$transaction(async (tx) => {
            // 1. ตรวจสอบว่า Supplier และ ProductUnit ทั้งหมดมีอยู่จริง
            const supplier = await prisma.supplier.findUnique({ where: { id: Number(supplierId) } });
            if (!supplier) {
                // ใช้ throw error เพื่อให้ transaction rollback อัตโนมัติ
                throw new Error("Supplier not found.");
            }

            const productUnitIds = details.map(d => d.productUnitId);
            const productUnits = await prisma.productUnit.findMany({
                where: { id: { in: productUnitIds } }
            });

            if (productUnits.length !== productUnitIds.length) {
                throw new Error("One or more product units not found.");
            }

            // 2. ✨ คำนวณราคารวมจากข้อมูลใน `details` (ราคา ณ ตอนสั่งซื้อ)
            const totalPrice = details.reduce((sum, item) => sum + item.price * item.quantity, 0);

            // 3. สร้าง Purchase Order หลัก
            const purchaseOrder = await prisma.purchaseOrder.create({
                data: {
                    supplierId: Number(supplierId),
                    totalPrice: totalPrice,
                    status: "pending", // สถานะเริ่มต้น
                }
            });

            // 4. ✨ สร้าง Purchase Order Details โดยอ้างอิง `productUnitId`
            const detailCreations = details.map(detail => {
                return prisma.purchaseOrderDetail.create({
                    data: {
                        poId: purchaseOrder.id,
                        productUnitId: Number(detail.productUnitId),
                        quantity: Number(detail.quantity),
                        price: Number(detail.price) // บันทึกราคาต่อหน่วย ณ ตอนที่สั่ง
                    }
                });
            });

            await Promise.all(detailCreations);

            // 5. คืนค่า PO ที่สมบูรณ์พร้อมข้อมูลที่เกี่ยวข้องทั้งหมด
            return prisma.purchaseOrder.findUnique({
                where: { id: purchaseOrder.id },
                include: {
                    supplier: true,
                    details: {
                        include: {
                            // ✨ ดึงข้อมูลลึกลงไปถึง drink
                            productUnit: {
                                include: {
                                    drink: true
                                }
                            }
                        }
                    }
                }
            });
        });

        res.status(201).json(newPurchaseOrder);

    } catch (error) {
        console.error("Error creating purchase order:", error);
        // แยก error case ที่เจาะจงมากขึ้น
        if (error.message.includes("not found")) {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ message: "Server Error creating purchase order" });
    }
};


/**
 * 📌 GET ALL PURCHASE ORDERS
 * ดึงข้อมูลใบสั่งซื้อทั้งหมด
 */
exports.getAllPurchaseOrders = async (req, res) => {
    try {
        const purchaseOrders = await prisma.purchaseOrder.findMany({
            include: {
                supplier: true,
                details: {
                    include: {
                        // ✨ แก้ไข path ของ include ให้ถูกต้องตาม schema
                        productUnit: {
                            include: {
                                drink: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.json(purchaseOrders);
    } catch (error) {
        console.error("Error fetching purchase orders:", error);
        res.status(500).json({ message: "Server Error fetching purchase orders" });
    }
};

/**
 * 📌 GET PURCHASE ORDER BY ID
 * ดึงข้อมูลใบสั่งซื้อตาม ID
 */
exports.getPurchaseOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const purchaseOrder = await prisma.purchaseOrder.findUnique({
            where: { id: Number(id) },
            include: {
                supplier: true,
                details: {
                    include: {
                        // ✨ แก้ไข path ของ include ให้ถูกต้อง
                        productUnit: {
                            include: {
                                drink: true
                            }
                        }
                    }
                }
            }
        });

        if (!purchaseOrder) {
            return res.status(404).json({ message: "Purchase Order not found" });
        }
        res.json(purchaseOrder);
    } catch (error) {
        console.error("Error fetching purchase order by ID:", error);
        res.status(500).json({ message: "Server Error fetching purchase order" });
    }
};

/**
 * 📌 UPDATE PURCHASE ORDER STATUS
 * อัปเดตสถานะใบสั่งซื้อ (เช่น 'approved', 'cancelled')
 * ถ้าสถานะเป็น 'approved' จะทำการเพิ่มสต็อกสินค้า (Drink)
 */
exports.updatePurchaseOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !['pending', 'approved', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: "Invalid or missing status. Allowed: pending, approved, cancelled" });
        }

        const updatedPo = await prisma.$transaction(async (tx) => {
            // 1. ดึงข้อมูล PO และตรวจสอบว่ามีอยู่จริงหรือไม่
            const purchaseOrder = await prisma.purchaseOrder.findUnique({
                where: { id: Number(id) },
                // ✨ ดึงข้อมูล `productUnit` มาด้วย เพราะต้องใช้ `baseItemsCount` และ `drinkId`
                include: {
                    details: {
                        include: {
                            productUnit: true
                        }
                    }
                }
            });

            if (!purchaseOrder) {
                throw new Error('P2025'); // โยน Error มาตรฐานของ Prisma (Record not found)
            }

            // 2. ป้องกันการ `approve` ซ้ำซ้อน
            if (purchaseOrder.status === 'approved' && status === 'approved') {
                console.warn(`Purchase order ${id} is already approved. No stock update performed.`);
                return purchaseOrder; // คืนค่าเดิมไปเลย ไม่ต้องทำอะไรเพิ่ม
            }

            // 3. ✨ หาก `approve` จะต้องอัปเดตสต็อก
            if (status === 'approved') {
                const stockUpdates = purchaseOrder.details.map(detail => {
                    if (!detail.productUnit) {
                        // ป้องกันกรณีข้อมูล productUnit เพี้ยน
                        throw new Error(`Product unit data missing for detail ID: ${detail.id}`);
                    }

                    // คำนวณจำนวนสินค้าหน่วยย่อยทั้งหมดที่ต้องเพิ่มเข้าสต็อก
                    // (จำนวนแพ็กเกจ * จำนวนหน่วยย่อยในแพ็กเกจ)
                    const quantityToAdd = detail.quantity * detail.productUnit.baseItemsCount;

                    return prisma.drink.update({
                        where: { id: detail.productUnit.drinkId }, // อัปเดต `Drink` ที่ถูกต้อง
                        data: {
                            qty: {
                                increment: quantityToAdd // เพิ่มสต็อกตามจำนวนที่คำนวณ
                            }
                        }
                    });
                });
                await Promise.all(stockUpdates);
            }

            // 4. อัปเดตสถานะของ PO
            return prisma.purchaseOrder.update({
                where: { id: Number(id) },
                data: { status: status },
                include: { // include ข้อมูลทั้งหมดเพื่อส่งกลับไปให้ client
                    supplier: true,
                    details: {
                        include: {
                            productUnit: { include: { drink: true } }
                        }
                    }
                }
            });
        });

        res.json(updatedPo);

    } catch (error) {
        if (error.code === 'P2025' || error.message === 'P2025') {
            return res.status(404).json({ message: "Purchase Order not found" });
        }
        console.error("Error updating purchase order status:", error);
        res.status(500).json({ message: "Server Error updating purchase order status" });
    }
};


/**
 * 📌 DELETE PURCHASE ORDER
 * ลบใบสั่งซื้อ
 */
exports.deletePurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;

        // ✨ ไม่จำเป็นต้องลบ details ก่อน เพราะใน Schema กำหนด `onDelete: Cascade` ไว้แล้ว
        // Prisma จะจัดการลบ PurchaseOrderDetail ที่เกี่ยวข้องให้เองโดยอัตโนมัติ
        const deletedOrder = await prisma.purchaseOrder.delete({
            where: { id: Number(id) },
        });

        res.json({ message: "Purchase Order and all its details deleted successfully." });

    } catch (error) {
        // P2025 คือ error code ของ Prisma เมื่อหา record ที่จะลบ/อัปเดตไม่เจอ
        if (error.code === 'P2025') {
            return res.status(404).json({ message: "Purchase Order not found" });
        }
        console.error("Error deleting purchase order:", error);
        res.status(500).json({ message: "Server Error deleting purchase order" });
    }
};