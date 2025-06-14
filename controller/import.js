const prisma = require("../config/prisma");

// Controller สำหรับการยืนยันใบสั่งซื้อ และรับสินค้าเข้าสต็อก
exports.confirmPurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;

        const importReceiptResult = await prisma.$transaction(async (tx) => {

            // --- 1. แก้ไข: ดึงข้อมูล PO พร้อมรายละเอียดเชิงลึก ---
            // เราต้อง include ไปถึง productUnit เพื่อเอา drinkId และ baseItemsCount มาใช้
            const purchaseOrder = await tx.purchaseOrder.findUnique({
                where: { id: Number(id) },
                include: {
                    details: {
                        include: {
                            productUnit: {
                                select: {
                                    id: true,
                                    drinkId: true,        // ID ของเครื่องดื่มหลัก
                                    baseItemsCount: true, // จำนวนหน่วยย่อยต่อแพ็กเกจ
                                }
                            }
                        }
                    }
                },
            });

            // --- 2. ตรวจสอบเงื่อนไขต่างๆ ---
            if (!purchaseOrder) {
                throw new Error('PO_NOT_FOUND');
            }
            if (purchaseOrder.status === 'approved') {
                throw new Error('PO_ALREADY_APPROVED');
            }
            if (!purchaseOrder.details || purchaseOrder.details.length === 0) {
                throw new Error('PO_HAS_NO_DETAILS');
            }

            // --- 3. อัปเดตสถานะ PO เป็น "approved" ---
            await tx.purchaseOrder.update({
                where: { id: Number(id) },
                data: { status: 'approved' }
            });

            // --- 4. สร้างใบรับสินค้า (ImportReceipt) ---
            const newImportReceipt = await tx.importReceipt.create({
                data: {
                    supplierId: purchaseOrder.supplierId,
                    importDate: new Date(),
                    totalPrice: purchaseOrder.totalPrice,
                    purchaseOrderId: purchaseOrder.id,
                    status: 'completed' // หรือ 'approved' ตามที่คุณกำหนด
                }
            });

            // --- 5. สร้าง ImportDetail และเตรียมอัปเดตสต็อก ---
            const allOperations = [];
            for (const item of purchaseOrder.details) {
                // ตรวจสอบว่ามีข้อมูล productUnit ครบถ้วน
                if (!item.productUnit || !item.productUnit.drinkId || item.productUnit.baseItemsCount === undefined) {
                    throw new Error(`Incomplete product unit data for detail ID: ${item.id}`);
                }

                // --- 5.1 แก้ไข: คำนวณจำนวนสต็อกหน่วยย่อยที่จะเพิ่ม ---
                const quantityInBaseUnits = item.quantity * item.productUnit.baseItemsCount;

                // --- 5.2 แก้ไข: สร้าง ImportDetail โดยใช้ข้อมูลที่ถูกต้อง ---
                allOperations.push(tx.importDetail.create({
                    data: {
                        importId: newImportReceipt.id,
                        drinkId: item.productUnit.drinkId, // <-- ใช้ drinkId จาก productUnit
                        quantity: quantityInBaseUnits,    // <-- ใช้จำนวนที่คำนวณแล้ว
                        price: item.price                 // <-- ราคาทุนต่อหน่วยที่ซื้อ
                    }
                }));

                // --- 5.3 แก้ไข: เพิ่มสต็อกในตาราง Drink ด้วย ORM ที่ปลอดภัยกว่า ---
                allOperations.push(tx.drink.update({
                    where: { id: item.productUnit.drinkId }, // <-- อ้างอิง drinkId ที่ถูกต้อง
                    data: {
                        qty: {
                            increment: quantityInBaseUnits // <-- เพิ่มสต็อกตามจำนวนที่คำนวณ
                        }
                    }
                }));
            }

            // 6. รอให้ทุก Operation (สร้าง detail + อัปเดตสต็อก) เสร็จสิ้นพร้อมกัน
            await Promise.all(allOperations);

            // 7. คืนค่า ImportReceipt ที่สร้างเสร็จพร้อมรายละเอียดทั้งหมด
            return tx.importReceipt.findUnique({
                where: { id: newImportReceipt.id },
                include: {
                    details: {
                        include: {
                            drink: true
                        }
                    },
                    supplier: true,
                    purchaseOrder: true
                }
            });
        });

        // 8. ส่ง response กลับเมื่อทุกอย่างสำเร็จ
        res.status(200).json({
            message: "Purchase Order confirmed and imported successfully.",
            importReceipt: importReceiptResult
        });

    } catch (error) {
        console.error("Transaction failed! Error confirming purchase order:", error);

        // จัดการ Error case ต่างๆ
        if (error.message === 'PO_NOT_FOUND') {
            return res.status(404).json({ message: "Purchase Order not found." });
        }
        if (error.message === 'PO_ALREADY_APPROVED') {
            return res.status(409).json({ message: "This Purchase Order has already been approved." });
        }
        if (error.message === 'PO_HAS_NO_DETAILS') {
            return res.status(400).json({ message: "This Purchase Order has no details to import." });
        }
        res.status(500).json({ message: "Server error confirming purchase order.", error: error.message });
    }
};

exports.getImportDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const importDetail = await prisma.importReceipt.findUnique({
            where: { id: Number(id) },
            include: {
                supplier: true,
                purchaseOrder: true,
                details: {
                    include: { drink: true }
                }
            }
        });

        if (!importDetail) {
            return res.status(404).json({ message: 'Import Receipt not found.' });
        }
        res.status(200).json(importDetail);
    } catch (error) {
        console.error('Error fetching import detail:', error);
        res.status(500).json({ message: 'Server error while fetching import detail.' });
    }
};

exports.getAllImportReceipts = async (req, res) => {
    try {
        const receipts = await prisma.importReceipt.findMany({
            orderBy: { importDate: 'desc' },
            include: {
                supplier: true,
                purchaseOrder: {
                    select: { id: true, orderDate: true }
                },
                details: {
                    include: { drink: true }
                }
            }
        });
        res.status(200).json(receipts);
    } catch (error) {
        console.error('Error fetching import receipts:', error);
        res.status(500).json({ message: 'Server error while fetching import receipts.' });
    }
};
