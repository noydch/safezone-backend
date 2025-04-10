const prisma = require("../config/prisma");

exports.confirmPurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;

        const po = await prisma.purchaseOrder.findUnique({
            where: { id: Number(id) },
            include: { details: true },
        });



        // 1. อัปเดตสถานะ PO เป็น "approved"
        await prisma.purchaseOrder.update({
            where: { id: Number(id) },
            data: { status: 'approved' }
        });

        // 2. สร้าง importReceipt พร้อม supplierId
        const importReceipt = await prisma.importReceipt.create({
            data: {
                id: Number(id),
                importDate: new Date(),
                supplierId: Number(po.supplierId), // 👈 เพิ่มตรงนี้
                totalPrice: Number(po.totalPrice),
                purchaseOrderId: Number(po.id),
                status: 'approved'
            }
        });

        // 3. เพิ่มจำนวน drink
        for (const item of po.details) {
            await prisma.drink.update({
                where: { id: Number(item.drinkId) },
                data: {
                    qty: {
                        increment: Number(item.quantity)
                    }
                }
            });
        }

        res.status(200).json({
            message: "Purchase Order confirmed and imported successfully.",
            importReceipt
        });

    } catch (error) {
        console.error("Error confirming purchase order:", error);
        res.status(500).json({ message: "Server error confirming purchase order." });
    }
};


exports.getImportDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const importDetail = await prisma.importReceipt.findUnique({
            where: {
                id: Number(id),
            },
            include: {
                purchaseOrder: {
                    include: {
                        supplier: true,
                        details: {
                            include: {
                                drink: true
                            }
                        }
                    }
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
                purchaseOrder: {
                    include: {
                        supplier: true,
                        details: {
                            include: {
                                drink: true
                            }
                        }
                    }
                }
            }
        });

        res.status(200).json(receipts);
    } catch (error) {
        console.error('Error fetching import receipts:', error);
        res.status(500).json({ message: 'Server error while fetching import receipts.' });
    }
};