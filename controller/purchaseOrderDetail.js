const prisma = require('../config/prisma');

// 📌 GET ALL PURCHASE ORDER DETAILS (Optional: Filter by poId)
exports.getAllPurchaseOrderDetails = async (req, res) => {
    try {
        const { poId } = req.query; // Get poId from query parameters
        const whereCondition = poId ? { poId: Number(poId) } : {};

        const details = await prisma.purchaseOrderDetail.findMany({
            where: whereCondition,
            include: {
                drink: true,       // Include drink details
                purchaseOrder: false // Usually not needed here, prevents large object
            },
            orderBy: {
                id: 'asc'
            }
        });
        res.json(details);
    } catch (error) {
        console.error("Error fetching purchase order details:", error);
        res.status(500).json({ message: "Server Error fetching purchase order details" });
    }
};

// 📌 GET PURCHASE ORDER DETAIL BY ID
exports.getPurchaseOrderDetailById = async (req, res) => {
    try {
        const { id } = req.params;
        const detail = await prisma.purchaseOrderDetail.findUnique({
            where: { id: Number(id) },
            include: {
                drink: true,
                // purchaseOrder: true // Optionally include parent PO details
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

// Helper function to recalculate and update Purchase Order total price
async function updatePurchaseOrderTotal(tx, poId) {
    const details = await tx.purchaseOrderDetail.findMany({
        where: { poId: Number(poId) }
    });
    const newTotalPrice = details.reduce((sum, item) => sum + item.price * item.quantity, 0);
    await tx.purchaseOrder.update({
        where: { id: Number(poId) },
        data: { totalPrice: newTotalPrice }
    });
     return newTotalPrice; // Return the new total for potential use
}

// 📌 UPDATE PURCHASE ORDER DETAIL
exports.updatePurchaseOrderDetail = async (req, res) => {
    const { id } = req.params;
    const { quantity, price } = req.body;

    if (quantity === undefined && price === undefined) {
        return res.status(400).json({ message: "Quantity or price must be provided for update." });
    }
    if (quantity !== undefined && (isNaN(Number(quantity)) || Number(quantity) <= 0)) {
         return res.status(400).json({ message: "Invalid quantity provided. Must be a positive number." });
    }
     if (price !== undefined && (isNaN(Number(price)) || Number(price) < 0)) {
         return res.status(400).json({ message: "Invalid price provided. Must be a non-negative number." });
    }

    try {
        const updatedDetail = await prisma.$transaction(async (tx) => {
            // 1. Find the detail to get its poId
            const detail = await tx.purchaseOrderDetail.findUnique({
                where: { id: Number(id) },
                select: { poId: true } // Only select poId
            });

            if (!detail) {
                throw new Error('P2025'); // Simulate Prisma not found error
            }
            const poId = detail.poId;

            // 2. Update the specific detail
            const currentUpdate = await tx.purchaseOrderDetail.update({
                where: { id: Number(id) },
                data: {
                    quantity: quantity !== undefined ? Number(quantity) : undefined,
                    price: price !== undefined ? Number(price) : undefined
                },
                 include: { drink: true } // Return updated detail with drink info
            });

            // 3. Recalculate and update the parent PurchaseOrder's total price
            await updatePurchaseOrderTotal(tx, poId);

            return currentUpdate; // Return the updated detail item
        });

        res.json(updatedDetail);
    } catch (error) {
        if (error.message === 'P2025' || error.code === 'P2025') {
            return res.status(404).json({ message: "Purchase Order Detail not found" });
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
            // 1. Find the detail to get its poId before deleting
            const detail = await tx.purchaseOrderDetail.findUnique({
                where: { id: Number(id) },
                select: { poId: true }
            });

            if (!detail) {
                 throw new Error('P2025'); // Simulate Prisma not found error
            }
            const poId = detail.poId;

            // 2. Delete the detail
            await tx.purchaseOrderDetail.delete({
                where: { id: Number(id) }
            });

            // 3. Recalculate and update the parent PurchaseOrder's total price
             await updatePurchaseOrderTotal(tx, poId);
        });

        res.json({ message: "Purchase Order Detail deleted successfully" });
    } catch (error) {
        if (error.message === 'P2025' || error.code === 'P2025') {
            return res.status(404).json({ message: "Purchase Order Detail not found" });
        }
        console.error("Error deleting purchase order detail:", error);
        res.status(500).json({ message: "Server Error deleting purchase order detail" });
    }
};

// 📌 GET ALL DETAILS FOR A SPECIFIC PURCHASE ORDER (using path parameter)
exports.getAllPurchaseOrderDetailsByPurchaseOrderId = async (req, res) => {
    try {
        const { purchaseOrderId } = req.params; // Get purchaseOrderId from path parameters

        const details = await prisma.purchaseOrderDetail.findMany({
            where: { poId: Number(purchaseOrderId) }, // Filter by the path parameter
            include: {
                drink: true,       // Include drink details
            },
            orderBy: {
                id: 'asc'
            }
        });

        // Optional: Check if the Purchase Order itself exists if needed
        if (details.length === 0) {
            const purchaseOrderExists = await prisma.purchaseOrder.findUnique({
                 where: { id: Number(purchaseOrderId) },
                 select: { id: true }
            });
            if (!purchaseOrderExists) {
                 return res.status(404).json({ message: `Purchase Order with ID ${purchaseOrderId} not found.` });
            }
            // If PO exists but has no details, return empty array
        }

        res.json(details);
    } catch (error) {
        console.error(`Error fetching details for Purchase Order ID ${req.params.purchaseOrderId}:`, error);
        res.status(500).json({ message: "Server Error fetching purchase order details by Purchase Order ID" });
    }
};
 