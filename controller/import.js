const prisma = require("../config/prisma");

exports.confirmPurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        console.log("Confirming PO ID:", id); // Log ID ที่ได้รับ

        const importReceiptResult = await prisma.$transaction(async (tx) => {

            // 1. ค้นหา Purchase Order พร้อมรายละเอียด และตรวจสอบ
            const purchaseOrder = await tx.purchaseOrder.findUnique({
                where: { id: Number(id) },
                include: { details: true },
            });

            if (!purchaseOrder) {
                console.error("PO NOT FOUND:", id);
                throw new Error('PO_NOT_FOUND');
            }

            if (purchaseOrder.status === 'approved') {
                console.warn("PO ALREADY APPROVED:", id);
                throw new Error('PO_ALREADY_APPROVED');
            }

            if (!purchaseOrder.details || purchaseOrder.details.length === 0) {
                console.error("PO HAS NO DETAILS:", id);
                throw new Error('PO_HAS_NO_DETAILS');
            }

            console.log("PO Found:", purchaseOrder.id, "Status:", purchaseOrder.status);

            // 2. อัปเดตสถานะ PO เป็น "approved"
            await tx.purchaseOrder.update({
                where: { id: Number(id) },
                data: { status: 'approved' }
            });
            console.log("PO Status Updated to approved");

            // 3. สร้าง ImportReceipt
            const newImportReceipt = await tx.importReceipt.create({
                data: {
                    supplierId: purchaseOrder.supplierId,
                    importDate: new Date(),
                    totalPrice: purchaseOrder.totalPrice,
                    purchaseOrderId: purchaseOrder.id,
                    status: 'completed'
                }
            });
            console.log("ImportReceipt Created:", newImportReceipt.id);

            // 4. สร้าง ImportDetail และเตรียมอัปเดต Drink Qty
            const allOperations = [];

            purchaseOrder.details.forEach(item => {
                console.log(`Processing item: Drink ID ${item.drinkId}, Qty ${item.quantity}`);

                // 4.1 เพิ่ม Promise สำหรับสร้าง ImportDetail
                allOperations.push(tx.importDetail.create({
                    data: {
                        importId: newImportReceipt.id,
                        drinkId: Number(item.drinkId),
                        quantity: Number(item.quantity),
                        price: Number(item.price)
                    }
                }));

                // 4.2 --- (แก้ไขตรงนี้) ---
                // ใช้ $executeRaw เพื่ออัปเดตอย่างปลอดภัย และจัดการกับ null ด้วย COALESCE
                // !!สำคัญ!!: แก้ "drinks" ให้เป็นชื่อตารางจริงของคุณในฐานข้อมูล (ถ้าไม่ใช่ drinks)
                allOperations.push(tx.$executeRaw`
                    UPDATE drinks 
                    SET qty = COALESCE(qty, 0) + ${Number(item.quantity)} 
                    WHERE id = ${Number(item.drinkId)}
                `);
                // --- จบส่วนแก้ไข ---
            });


            console.log(`Prepared ${allOperations.length} operations for Promise.all.`);

            // 5. รอให้ *ทุก* Operation เสร็จสิ้น
            await Promise.all(allOperations); // <--- รอทุกอย่างที่อยู่ใน Array

            console.log("All operations completed successfully.");

            // 6. คืนค่า ImportReceipt ที่สร้างเสร็จพร้อมรายละเอียด
            return tx.importReceipt.findUnique({
                where: { id: newImportReceipt.id },
                include: { details: { include: { drink: true } } }
            });
        });

        // 7. ส่ง response กลับเมื่อทุกอย่างสำเร็จ
        res.status(200).json({
            message: "Purchase Order confirmed and imported successfully.",
            importReceipt: importReceiptResult
        });

    } catch (error) {
        console.error("Transaction failed! Error confirming purchase order:", error); // Log error ที่เกิดขึ้น
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