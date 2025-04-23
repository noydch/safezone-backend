const prisma = require('../config/prisma');
// ควร import OrderStatus enum เพื่อใช้ในการ validation
const { OrderStatus } = require('@prisma/client');

// CREATE ORDER (ไม่เปลี่ยนแปลงจากเดิมมากนัก, status จะถูก set เป็น PENDING โดย default)
exports.createOrder = async (req, res) => {
    try {
        const { empId, orderDetails, paymentMethod } = req.body;

        if (!empId || !orderDetails || !Array.isArray(orderDetails) || orderDetails.length === 0 || !paymentMethod) {
            return res.status(400).json({ message: "Employee ID, order details, and payment method are required." });
        }

        if (paymentMethod !== 'CASH' && paymentMethod !== 'TRANSFER') {
            return res.status(400).json({ message: "Invalid payment method. Must be 'CASH' or 'TRANSFER'." });
        }

        const total_price = orderDetails.reduce((sum, item) => {
            const price = parseFloat(item.price);
            const quantity = parseInt(item.quantity, 10);
            if (isNaN(price) || isNaN(quantity)) {
                throw new Error(`Invalid price or quantity for item: ${JSON.stringify(item)}`);
            }
            return sum + price * quantity;
        }, 0);

        const newOrder = await prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    empId: parseInt(empId),
                    total_price: total_price,
                    paymentMethod: paymentMethod,
                    // status: 'PENDING' // ไม่จำเป็นต้องใส่ เพราะมี @default(PENDING) ใน schema แล้ว
                },
            });

            const detailCreations = orderDetails.map(detail => {
                const detailData = {
                    ord_id: Number(order.id),
                    quantity: parseInt(detail.quantity, 10),
                    price: parseFloat(detail.price),
                };

                if (!detail.itemId || !detail.itemType) {
                    throw new Error(`Missing itemId or itemType for detail: ${JSON.stringify(detail)}`);
                }
                const itemId = parseInt(detail.itemId, 10);
                if (isNaN(itemId)) {
                    throw new Error(`Invalid itemId: ${detail.itemId}`);
                }

                if (detail.itemType === 'food') {
                    detailData.foodId = itemId;
                } else if (detail.itemType === 'drink') {
                    detailData.drinkId = itemId;
                } else {
                    throw new Error(`Invalid item type: ${detail.itemType}`);
                }
                if (detailData.foodId === undefined && detailData.drinkId === undefined) {
                    throw new Error(`Item type '${detail.itemType}' requires a valid foodId or drinkId.`);
                }

                return tx.orderDetail.create({ data: detailData });
            });

            await Promise.all(detailCreations);

            // Fetch order ที่สมบูรณ์กลับไป (ตอนนี้จะมี status: 'PENDING' และ updatedAt เพิ่มมาด้วย)
            const completeOrder = await tx.order.findUnique({
                where: { id: Number(order.id) },
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
            if (!completeOrder) {
                throw new Error("Failed to retrieve the created order after transaction.");
            }
            return completeOrder;
        });

        res.status(201).json(newOrder);

    } catch (error) {
        console.error("Error creating order:", error);
        if (error.message.includes('Invalid') || error.message.includes('Missing')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.code && error.code.startsWith('P')) {
            return res.status(400).json({ message: "Database error during order creation.", code: error.code });
        }
        res.status(500).json({ message: "Server Error creating order" });
    }
};

// GET ALL ORDERS (ไม่เปลี่ยนแปลง, status และ updatedAt จะถูกดึงมาอัตโนมัติ)
exports.getAllOrders = async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            include: {
                employee: true,
                orderDetails: {
                    include: {
                        food: true,
                        drink: true
                    }
                }
            },
            orderBy: {
                // สามารถเรียงตาม updatedAt หรือ status ได้ถ้าต้องการ
                createdAt: 'desc'
            }
        });
        res.json(orders);
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: "Server Error fetching orders" });
    }
};

// GET ORDER BY ID (ไม่เปลี่ยนแปลง, status และ updatedAt จะถูกดึงมาอัตโนมัติ)
exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const orderId = parseInt(id, 10);
        if (isNaN(orderId)) {
            return res.status(400).json({ message: "Invalid Order ID format." });
        }

        const order = await prisma.order.findUnique({
            where: { id: Number(orderId) },
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

// DELETE ORDER (ไม่เปลี่ยนแปลง)
exports.deleteOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const orderId = parseInt(id, 10);
        if (isNaN(orderId)) {
            return res.status(400).json({ message: "Invalid Order ID format." });
        }

        await prisma.$transaction(async (tx) => {
            const orderExists = await tx.order.findUnique({ where: { id: orderId } });
            if (!orderExists) {
                throw new Error("Order not found");
            }

            // ลบ OrderDetail ก่อน (ถ้ามี onDelete: Cascade ใน schema อาจจะไม่จำเป็นต้องทำ manual)
            await tx.orderDetail.deleteMany({
                where: { ord_id: orderId }
            });

            // ลบ Order หลัก
            await tx.order.delete({
                where: { id: orderId }
            });
        });

        res.json({ message: "Order deleted successfully" });
    } catch (error) {
        console.error("Error deleting order:", error);
        if (error.message === "Order not found" || error.code === 'P2025') {
            return res.status(404).json({ message: "Order not found" });
        }
        res.status(500).json({ message: "Server Error deleting order" });
    }
};

// ----- เพิ่ม FUNCTION ใหม่สำหรับอัปเดตสถานะ -----
exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        console.log(req.params);

        const orderId = parseInt(id, 10);
        if (isNaN(orderId)) {
            return res.status(400).json({ message: "Invalid Order ID format." });
        }

        // ตรวจสอบว่า status ที่ส่งมาถูกต้องตาม enum หรือไม่
        if (!status || !Object.values(OrderStatus).includes(status)) {
            return res.status(400).json({
                message: "Invalid or missing status. Must be one of: " + Object.values(OrderStatus).join(', ')
            });
        }

        const updatedOrder = await prisma.order.update({
            where: { id: Number(orderId) },
            data: {
                status: status, // อัปเดต status
                // updatedAt จะถูกอัปเดตอัตโนมัติโดย @updatedAt ใน schema
            },
            include: { // ดึงข้อมูลทั้งหมดกลับไปเพื่อแสดงผล (เหมือน getOrderById)
                employee: true,
                orderDetails: {
                    include: {
                        food: true,
                        drink: true
                    }
                }
            }
        });

        res.json(updatedOrder);

    } catch (error) {
        console.error("Error updating order status:", error);
        // จัดการ error กรณีหา order ไม่เจอ (P2025)
        if (error.code === 'P2025') {
            return res.status(404).json({ message: "Order not found" });
        }
        // จัดการ error อื่นๆ
        res.status(500).json({ message: "Server Error updating order status" });
    }
};

exports.getOrderReport = async (req, res) => {
    try {
        // Optional: ดึง query จากวันที่ (format: YYYY-MM-DD)
        const { startDate, endDate } = req.query;

        const whereClause = {};
        if (startDate && endDate) {
            whereClause.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        // รวมข้อมูลรายงาน
        const [orders, totalRevenue, totalItems] = await Promise.all([
            prisma.order.findMany({
                where: whereClause,
                include: {
                    orderDetails: true
                }
            }),
            prisma.order.aggregate({
                _sum: { total_price: true },
                where: whereClause
            }),
            prisma.orderDetail.aggregate({
                _sum: { quantity: true },
                where: {
                    order: whereClause
                }
            })
        ]);

        const totalOrders = orders.length;

        res.json({
            totalOrders,
            totalRevenue: totalRevenue._sum.total_price || 0,
            totalItemsSold: totalItems._sum.quantity || 0,
            orders
        });

    } catch (error) {
        console.error("Error generating order report:", error);
        res.status(500).json({ message: "Server Error generating report" });
    }
};
// 


exports.getIncomeExpenseReport = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // รายรับจากออเดอร์ที่ชำระแล้ว
        const incomeOrders = await prisma.order.findMany({
            where: {
                status: "PAID",
                createdAt: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            },
            select: {
                id: true,
                total_price: true,
                createdAt: true
            }
        });

        // รายจ่ายจาก ImportReceipt ที่รับของแล้ว
        const expenseReceipts = await prisma.importReceipt.findMany({
            where: {
                status: "approved",
                createdAt: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            },
            select: {
                id: true,
                totalPrice: true,
                createdAt: true
            }
        });

        const totalIncome = incomeOrders.reduce((sum, order) => sum + order.total_price, 0);
        const totalExpense = expenseReceipts.reduce((sum, receipt) => sum + receipt.totalPrice, 0);

        res.json({
            period: {
                from: startOfMonth.toISOString(),
                to: endOfMonth.toISOString()
            },
            totalIncome,
            totalExpense,
            netProfit: totalIncome - totalExpense,
            incomeDetails: incomeOrders,
            expenseDetails: expenseReceipts
        });

    } catch (error) {
        console.error("Error generating monthly income/expense report:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

