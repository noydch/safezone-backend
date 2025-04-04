const prisma = require('../config/prisma');

// 📌 CREATE PURCHASE ORDER
exports.createPurchaseOrder = async (req, res) => {
    try {
        const { supplierId, details } = req.body; // details: [{ drinkId, quantity, price }, ...]

        if (!supplierId || !details || !Array.isArray(details) || details.length === 0) {
            return res.status(400).json({ message: "Supplier ID and order details are required." });
        }

        // Validate details array content
        for (const item of details) {
            if (!item.drinkId || !item.quantity || item.quantity <= 0 || !item.price || item.price < 0) {
                return res.status(400).json({ message: `Invalid detail item: ${JSON.stringify(item)}. Ensure drinkId, positive quantity, and non-negative price are provided.` });
            }
        }

        // Check if supplier exists
        const supplier = await prisma.supplier.findUnique({ where: { id: Number(supplierId) } });
        if (!supplier) {
            return res.status(404).json({ message: "Supplier not found." });
        }

        // Calculate total price
        const totalPrice = details.reduce((sum, item) => sum + item.price * item.quantity, 0);

        // Create Purchase Order and Details in a transaction
        const newPurchaseOrder = await prisma.$transaction(async (tx) => {
            // 1. Create the main Purchase Order
            const purchaseOrder = await tx.purchaseOrder.create({
                data: {
                    supplierId: Number(supplierId),
                    totalPrice: totalPrice,
                    // status defaults to 'pending'
                }
            });

            // 2. Create Purchase Order Details
            const detailCreations = details.map(detail => {
                return tx.purchaseOrderDetail.create({
                    data: {
                        poId: purchaseOrder.id,
                        drinkId: Number(detail.drinkId),
                        quantity: Number(detail.quantity),
                        price: Number(detail.price)
                    }
                });
            });

            await Promise.all(detailCreations);

            // 3. Return the complete Purchase Order with details
            return tx.purchaseOrder.findUnique({
                where: { id: purchaseOrder.id },
                include: {
                    details: {
                        include: {
                            drink: true // Include drink details
                        }
                    }
                    // supplier: true // Optionally include supplier details again
                }
            });
        });

        res.status(201).json(newPurchaseOrder);

    } catch (error) {
        console.error("Error creating purchase order:", error);
         // Handle foreign key constraint errors (e.g., invalid drinkId)
        if (error.code === 'P2003' && error.meta?.field_name?.includes('drinkId')) {
            return res.status(400).json({ message: "Invalid drinkId provided in details." });
        }
        res.status(500).json({ message: "Server Error creating purchase order" });
    }
};

// 📌 GET ALL PURCHASE ORDERS
exports.getAllPurchaseOrders = async (req, res) => {
    try {
        const purchaseOrders = await prisma.purchaseOrder.findMany({
            include: {
                supplier: true, // Include supplier details
                details: {
                    include: {
                        drink: true // Include details about the drinks
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

// 📌 GET PURCHASE ORDER BY ID
exports.getPurchaseOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const purchaseOrder = await prisma.purchaseOrder.findUnique({
            where: { id: Number(id) },
            include: {
                // supplier: true,
                details: {
                    include: {
                        drink: true
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

// 📌 UPDATE PURCHASE ORDER STATUS
exports.updatePurchaseOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // e.g., 'approved', 'cancelled'

        if (!status) {
            return res.status(400).json({ message: "Status is required." });
        }

        const allowedStatuses = ['pending', 'approved', 'cancelled'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` });
        }

        const updatedPurchaseOrder = await prisma.purchaseOrder.update({
            where: { id: Number(id) },
            data: { status: status },
             include: { // Optionally return details after update
                // supplier: true,
                details: {
                    include: {
                        drink: true
                    }
                }
            }
        });

        res.json(updatedPurchaseOrder);
    } catch (error) {
        if (error.code === 'P2025') { // Record not found
            return res.status(404).json({ message: "Purchase Order not found" });
        }
        console.error("Error updating purchase order status:", error);
        res.status(500).json({ message: "Server Error updating purchase order status" });
    }
};

// 📌 DELETE PURCHASE ORDER
exports.deletePurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;

        // Use transaction to delete details first, then the order
        await prisma.$transaction(async (tx) => {
            // 1. Delete related PurchaseOrderDetail records
            await tx.purchaseOrderDetail.deleteMany({
                where: { poId: Number(id) }
            });

            // 2. Delete the PurchaseOrder
            // Use findUnique first to ensure it exists and throw specific error if not
            const po = await tx.purchaseOrder.findUnique({ where: { id: Number(id) } });
            if (!po) {
                 throw new Error('P2025'); // Simulate Prisma's not found error code
            }
            await tx.purchaseOrder.delete({
                where: { id: Number(id) }
            });
        });

        res.json({ message: "Purchase Order deleted successfully" });
    } catch (error) {
         if (error.message === 'P2025' || error.code === 'P2025') { // Record not found
            return res.status(404).json({ message: "Purchase Order not found" });
        }
        console.error("Error deleting purchase order:", error);
        res.status(500).json({ message: "Server Error deleting purchase order" });
    }
}; 