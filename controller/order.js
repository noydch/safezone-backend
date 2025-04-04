const prisma = require('../config/prisma');

// 📌 CREATE ORDER
exports.createOrder = async (req, res) => {
    try {
        const { empId, orderDetails } = req.body; // orderDetails is an array: [{ itemId, itemType, quantity, price }, ...]

        if (!empId || !orderDetails || !Array.isArray(orderDetails) || orderDetails.length === 0) {
            return res.status(400).json({ message: "Employee ID and order details are required." });
        }

        // Calculate total price
        const total_price = orderDetails.reduce((sum, item) => sum + item.price * item.quantity, 0);

        // Create the order and its details in a transaction
        const newOrder = await prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    empId: parseInt(empId),
                    total_price: total_price,
                },
                include: {
                    employee: true // Include employee details in the response
                }
            });

            const detailCreations = orderDetails.map(detail => {
                const detailData = {
                    ord_id: order.id,
                    quantity: detail.quantity,
                    price: detail.price,
                };
                if (detail.itemType === 'food') {
                    detailData.foodId = detail.itemId;
                } else if (detail.itemType === 'drink') {
                    detailData.drinkId = detail.itemId;
                } else {
                    // Handle unknown item type if necessary
                    throw new Error(`Invalid item type: ${detail.itemType}`);
                }
                return tx.orderDetail.create({ data: detailData });
            });

            await Promise.all(detailCreations);

            // Fetch the order again with details to return the complete object
             const completeOrder = await tx.order.findUnique({
                where: { id: order.id },
                include: {
                    employee: true,
                    orderDetails: {
                        include: {
                            food: true,
                            drink: true
                        }
                    }
                }
            });
            return completeOrder;
        });

        res.status(201).json(newOrder);

    } catch (error) {
        console.error("Error creating order:", error);
        // Specific check for invalid item type error
        if (error.message.startsWith('Invalid item type:')) {
             return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Server Error creating order" });
    }
};

// 📌 GET ALL ORDERS
exports.getAllOrders = async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            include: {
                employee: true, // Include employee details
                orderDetails: {
                    include: {
                        food: true, // Include food details if it's a food item
                        drink: true // Include drink details if it's a drink item
                    }
                }
            },
            orderBy: {
                createdAt: 'desc' // Optional: Order by creation date, newest first
            }
        });

        res.json(orders);
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: "Server Error fetching orders" });
    }
};

// 📌 GET ORDER BY ID
exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma.order.findUnique({
            where: { id: Number(id) },
            include: {
                employee: true,
                orderDetails: {
                    include: {
                        food: true,
                        drink: true
                    }
                }
            }
        });

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        res.json(order);
    } catch (error) {
        console.error("Error fetching order by ID:", error);
        res.status(500).json({ message: "Server Error fetching order" });
    }
};

// 📌 DELETE ORDER
exports.deleteOrder = async (req, res) => {
    try {
        const { id } = req.params;

        // Use a transaction to ensure both order details and the order are deleted
        await prisma.$transaction(async (tx) => {
            // First, delete related OrderDetail records
            await tx.orderDetail.deleteMany({
                where: { ord_id: Number(id) }
            });

            // Then, delete the Order
            const deletedOrder = await tx.order.delete({
                where: { id: Number(id) }
            });

             if (!deletedOrder) {
                 // This case might not be reached if findUniqueOrThrow was used,
                 // but kept for robustness depending on exact error handling desired.
                 throw new Error("Order not found");
             }
        });

        res.json({ message: "Order deleted successfully" });
    } catch (error) {
        console.error("Error deleting order:", error);
         // Handle cases where the order might not be found if not using findUniqueOrThrow
        if (error.code === 'P2025' || error.message === "Order not found") { // P2025 is Prisma's code for record not found
             return res.status(404).json({ message: "Order not found" });
        }
        res.status(500).json({ message: "Server Error deleting order" });
    }
};
