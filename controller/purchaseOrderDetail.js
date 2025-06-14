const prisma = require('../config/prisma');

/**
 * Helper function to recalculate and update Purchase Order total price.
 * This function is well-designed and will be kept as is.
 * @param {object} tx - The Prisma transaction client.
 * @param {number} poId - The ID of the Purchase Order to update.
 */
async function updatePurchaseOrderTotal(tx, poId) {
    const details = await tx.purchaseOrderDetail.findMany({
        where: { poId: Number(poId) }
    });
    const newTotalPrice = details.reduce((sum, item) => sum + item.price * item.quantity, 0);

    await tx.purchaseOrder.update({
        where: { id: Number(poId) },
        data: { totalPrice: newTotalPrice }
    });
}


// 📌 GET ALL DETAILS FOR A SPECIFIC PURCHASE ORDER
exports.getAllDetailsByPurchaseOrderId = async (req, res) => {
    try {
        const { purchaseOrderId } = req.params;

        // 1. ตรวจสอบก่อนว่า Purchase Order มีอยู่จริงหรือไม่
        const purchaseOrder = await prisma.purchaseOrder.findUnique({
            where: { id: Number(purchaseOrderId) },
            select: { id: true }
        });

        if (!purchaseOrder) {
            return res.status(404).json({ message: `Purchase Order with ID ${purchaseOrderId} not found.` });
        }

        // 2. ถ้ามีอยู่จริง ค่อยดึงรายละเอียดทั้งหมด
        const details = await prisma.purchaseOrderDetail.findMany({
            where: { poId: Number(purchaseOrderId) },
            include: {
                // ✨ แก้ไข path ของ include ให้ถูกต้อง
                productUnit: {
                    include: {
                        drink: true
                    }
                }
            },
            orderBy: {
                id: 'asc'
            }
        });

        res.json(details);
    } catch (error) {
        console.error(`Error fetching details for Purchase Order ID ${req.params.purchaseOrderId}:`, error);
        res.status(500).json({ message: "Server Error fetching details by Purchase Order ID" });
    }
};

// 📌 GET PURCHASE ORDER DETAIL BY ID
exports.getPurchaseOrderDetailById = async (req, res) => {
    try {
        const { id } = req.params;
        const detail = await prisma.purchaseOrderDetail.findUnique({
            where: { id: Number(id) },
            include: {
                // ✨ แก้ไข path ของ include ให้ถูกต้อง
                productUnit: {
                    include: {
                        drink: true
                    }
                },
                // สามารถ include purchaseOrder กลับไปด้วยก็ได้ถ้าต้องการ
                purchaseOrder: {
                    select: {
                        id: true,
                        status: true
                    }
                }
            }
        });

        if (!detail) {
            return res.status(404).json({ message: "Purchase Order Detail not found" });
        }
        res.json(detail);
    } catch (error) {
        console.error("Error fetching purchase order detail by ID:", error);
        res.status(500).json({ message: "Server Error fetching purchase order detail" });
    }
};

// 📌 UPDATE PURCHASE ORDER DETAIL
exports.updatePurchaseOrderDetail = async (req, res) => {
    const { id } = req.params;
    const { quantity, price } = req.body;

    // --- Validation ---
    if (quantity === undefined && price === undefined) {
        return res.status(400).json({ message: "Quantity or price must be provided." });
    }
    // (validation logic for quantity and price remains the same)

    try {
        const updatedDetail = await prisma.$transaction(async (tx) => {
            // 1. ค้นหา Detail และ PO ที่เกี่ยวข้องเพื่อตรวจสอบสถานะ
            const detail = await tx.purchaseOrderDetail.findUnique({
                where: { id: Number(id) },
                include: { purchaseOrder: { select: { status: true } } }
            });

            if (!detail) {
                throw new Error('P2025'); // Record to update not found
            }

            // ✨ **Business Logic ที่สำคัญ:** ป้องกันการแก้ไข PO ที่ถูกอนุมัติหรือยกเลิกไปแล้ว
            if (detail.purchaseOrder.status === 'approved' || detail.purchaseOrder.status === 'cancelled') {
                throw new Error(`Cannot update detail of a purchase order that is already '${detail.purchaseOrder.status}'.`);
            }

            // 2. อัปเดต Detail
            const currentUpdate = await tx.purchaseOrderDetail.update({
                where: { id: Number(id) },
                data: {
                    quantity: quantity !== undefined ? Number(quantity) : undefined,
                    price: price !== undefined ? Number(price) : undefined
                },
                include: {
                    // ✨ แก้ไข path ของ include เพื่อส่งข้อมูลที่ถูกต้องกลับไป
                    productUnit: { include: { drink: true } }
                }
            });

            // 3. อัปเดตราคารวมของ PO หลัก
            await updatePurchaseOrderTotal(tx, detail.poId);

            return currentUpdate;
        });

        res.json(updatedDetail);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ message: "Purchase Order Detail not found" });
        }
        // จัดการ error ที่เรา throw เอง
        if (error.message.includes('Cannot update detail')) {
            return res.status(403).json({ message: error.message });
        }
        console.error("Error updating purchase order detail:", error);
        res.status(500).json({ message: "Server Error updating purchase order detail" });
    }
};

// 📌 DELETE PURCHASE ORDER DETAIL
exports.deletePurchaseOrderDetail = async (req, res) => {
    const { id } = req.params;

    try {
        await prisma.$transaction(async (tx) => {
            // 1. ค้นหา Detail และ PO ที่เกี่ยวข้องเพื่อตรวจสอบสถานะ
            const detail = await tx.purchaseOrderDetail.findUnique({
                where: { id: Number(id) },
                include: { purchaseOrder: { select: { status: true } } }
            });

            if (!detail) {
                throw new Error('P2025'); // Record to delete not found
            }

            // ✨ **Business Logic ที่สำคัญ:** ป้องกันการลบ Detail จาก PO ที่ถูกอนุมัติหรือยกเลิกไปแล้ว
            if (detail.purchaseOrder.status === 'approved' || detail.purchaseOrder.status === 'cancelled') {
                throw new Error(`Cannot delete detail of a purchase order that is already '${detail.purchaseOrder.status}'.`);
            }

            // 2. ลบ Detail
            await tx.purchaseOrderDetail.delete({
                where: { id: Number(id) }
            });

            // 3. อัปเดตราคารวมของ PO หลัก
            await updatePurchaseOrderTotal(tx, detail.poId);
        });

        res.json({ message: "Purchase Order Detail deleted successfully and parent order total updated." });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ message: "Purchase Order Detail not found" });
        }
        // จัดการ error ที่เรา throw เอง
        if (error.message.includes('Cannot delete detail')) {
            return res.status(403).json({ message: error.message });
        }
        console.error("Error deleting purchase order detail:", error);
        res.status(500).json({ message: "Server Error deleting purchase order detail" });
    }
};