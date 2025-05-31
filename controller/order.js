const prisma = require('../config/prisma');
const { KitchenStatus, BillStatus, PaymentMethod } = require('@prisma/client'); // Import Enums

// =================================================================
// 1. เพิ่มรายการอาหาร/เครื่องดื่มในโต๊ะ (สร้าง OrderRound ใหม่)
// =================================================================
exports.addOrderToTable = async (req, res) => {
    try {
        const { empId, tableId, orderDetails } = req.body;

        if (!empId || !tableId || !orderDetails || !Array.isArray(orderDetails) || orderDetails.length === 0) {
            return res.status(400).json({ message: "Employee ID, Table ID, and order details are required." });
        }

        const parsedTableId = parseInt(tableId, 10);
        const parsedEmpId = parseInt(empId, 10);

        if (isNaN(parsedTableId) || isNaN(parsedEmpId)) {
            return res.status(400).json({ message: "Invalid Employee ID or Table ID." });
        }

        // --- ⬇️ (แนะนำ) ตรวจสอบโต๊ะก่อนเริ่ม Transaction ⬇️ ---
        const tableExists = await prisma.table.findUnique({
            where: { id: parsedTableId }
        });

        if (!tableExists) {
            return res.status(404).json({ message: "Table not found." });
        }
        // --- ⬆️ สิ้นสุดการตรวจสอบโต๊ะ ⬆️ ---

        const newItemsTotalPrice = orderDetails.reduce((sum, item) => {
            const price = parseFloat(item.price);
            const quantity = parseInt(item.quantity, 10);
            if (isNaN(price) || isNaN(quantity)) {
                throw new Error(`Invalid price or quantity for item: ${JSON.stringify(item)}`);
            }
            return sum + price * quantity;
        }, 0);

        const resultOrder = await prisma.$transaction(async (tx) => {
            // 1. หา หรือ สร้าง Order หลัก (Main Bill)
            let mainOrder = await tx.order.findFirst({
                where: { tableId: parsedTableId, billStatus: BillStatus.OPEN },
            });

            if (!mainOrder) {
                mainOrder = await tx.order.create({
                    data: {
                        empId: parsedEmpId,
                        tableId: parsedTableId,
                        total_price: newItemsTotalPrice,
                        billStatus: BillStatus.OPEN,
                    },
                });
            } else {
                mainOrder = await tx.order.update({
                    where: { id: mainOrder.id },
                    data: {
                        total_price: { increment: newItemsTotalPrice },
                        empId: parsedEmpId, // อัปเดตพนักงานที่รับออเดอร์ล่าสุด
                    },
                });
            }

            // 2. หา Round Number ล่าสุด แล้ว +1
            const lastRound = await tx.orderRound.findFirst({
                where: { orderId: mainOrder.id },
                orderBy: { roundNumber: 'desc' }
            });
            const nextRoundNumber = (lastRound?.roundNumber || 0) + 1;

            // 3. สร้าง OrderRound ใหม่
            const newOrderRound = await tx.orderRound.create({
                data: {
                    orderId: mainOrder.id,
                    roundNumber: nextRoundNumber,
                    kitchenStatus: KitchenStatus.PENDING,
                }
            });

            // 4. สร้าง OrderDetail โดยผูกกับ OrderRound ใหม่
            const detailCreations = orderDetails.map(detail => {
                const detailData = {
                    orderRoundId: newOrderRound.id,
                    quantity: parseInt(detail.quantity, 10),
                    price: parseFloat(detail.price),
                };

                const itemId = parseInt(detail.itemId, 10);
                if (isNaN(itemId) || !detail.itemType) {
                    throw new Error(`Invalid/Missing itemId or itemType: ${JSON.stringify(detail)}`);
                }

                if (detail.itemType === 'food') {
                    detailData.foodId = itemId;
                } else if (detail.itemType === 'drink') {
                    detailData.drinkId = itemId;
                } else {
                    throw new Error(`Invalid item type: ${detail.itemType}`);
                }
                return tx.orderDetail.create({ data: detailData });
            });

            await Promise.all(detailCreations);

            // --- ⬇️ 5. อัปเดตสถานะโต๊ะเป็น 'ຖືກຈອງແລ້ວ' (เพิ่มเข้ามา) ⬇️ ---
            await tx.table.update({
                where: { id: parsedTableId },
                data: { status: 'ຖືກຈອງແລ້ວ' }
            });
            // --- ⬆️ สิ้นสุดการอัปเดตโต๊ะ ⬆️ ---


            // 6. Return Order หลัก พร้อม Round และ Detail ทั้งหมด
            return tx.order.findUnique({
                where: { id: mainOrder.id },
                include: {
                    employee: true,
                    table: true, // Include table เพื่อให้เห็นสถานะใหม่ (ถ้าต้องการ)
                    orderRounds: {
                        include: {
                            orderDetails: {
                                include: { food: true, drink: true }
                            }
                        },
                        orderBy: { roundNumber: 'asc' }
                    },
                },
            });
        }, {
            timeout: 15000
        });

        res.status(201).json(resultOrder);

    } catch (error) {
        console.error("Error creating/updating order:", error);
        res.status(500).json({ message: "Server Error processing order", error: error.message });
    }
};

// =================================================================
// 2. ชำระเงิน / ปิดบิล (Logic คล้ายเดิม แต่แก้ include)
// =================================================================
exports.checkoutOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { paymentMethod } = req.body;

        const parsedOrderId = parseInt(orderId, 10);
        if (isNaN(parsedOrderId)) {
            return res.status(400).json({ message: "Invalid Order ID." });
        }

        // Validate payment method
        const allowedPaymentMethods = Object.values(PaymentMethod || {});
        if (!paymentMethod || !allowedPaymentMethods.includes(paymentMethod)) {
            return res.status(400).json({
                message: "Invalid or missing payment method. Must be one of: " + allowedPaymentMethods.join(', ')
            });
        }

        // Fetch order with details for stock deduction
        const currentOrder = await prisma.order.findUnique({
            where: { id: parsedOrderId },
            include: {
                table: true,
                orderRounds: {
                    include: {
                        orderDetails: {
                            include: { drink: true }
                        }
                    }
                }
            }
        });

        if (!currentOrder) {
            return res.status(404).json({ message: "Order not found." });
        }

        if (currentOrder.billStatus !== BillStatus.OPEN) {
            return res.status(400).json({ message: `Order is not OPEN. Current status: ${currentOrder.billStatus}` });
        }

        if (!currentOrder.tableId) {
            return res.status(500).json({ message: "Internal Error: Order is not associated with a table." });
        }

        // Start transaction
        const updatedOrder = await prisma.$transaction(async (tx) => {
            // 1. Update order status to PAID
            const order = await tx.order.update({
                where: { id: parsedOrderId },
                data: {
                    billStatus: BillStatus.PAID,
                    payment_method: paymentMethod,
                },
                include: { // Include data for a complete response
                    employee: true,
                    table: true,
                    orderRounds: {
                        include: {
                            orderDetails: { include: { food: true, drink: true } }
                        },
                        orderBy: { roundNumber: 'asc' }
                    },
                }
            });

            // 2. Update table status to 'ວ່າງ' (available)
            if (currentOrder.tableId) {
                await tx.table.update({
                    where: { id: currentOrder.tableId },
                    data: { status: 'ວ່າງ' }
                });
            }

            // 3. Deduct drink stock
            for (const round of currentOrder.orderRounds || []) {
                for (const detail of round.orderDetails || []) {
                    if (detail.drinkId && detail.quantity > 0) {
                        // Optional: Check stock before decrementing to prevent negative stock
                        // const drinkItem = await tx.drink.findUnique({ where: { id: detail.drinkId }, select: { qty: true } });
                        // if (!drinkItem || drinkItem.qty === null || drinkItem.qty < detail.quantity) {
                        //     throw new Error(`Not enough stock for drink ID ${detail.drinkId}.`);
                        // }

                        await tx.drink.update({
                            where: { id: detail.drinkId },
                            data: {
                                qty: {
                                    decrement: detail.quantity
                                }
                            }
                        });
                    }
                }
            }
            return order;
        });

        res.json({
            message: "Order paid successfully, table status updated, and drink stock adjusted.",
            order: updatedOrder
        });

    } catch (error) {
        console.error("Error checking out order:", error);
        if (error.code === 'P2025') { // Prisma: Record to update not found
            return res.status(404).json({ message: "Order, table, or a drink in the order not found." });
        }
        // Handle specific errors like stock going negative if you added checks
        if (error.message.startsWith("Not enough stock")) {
            return res.status(409).json({ message: error.message });
        }
        res.status(500).json({ message: "Server Error during checkout", error: error.message });
    }
};
// =================================================================
// 3. ยกเลิกออเดอร์ (Logic คล้ายเดิม แต่แก้ include)
// =================================================================
exports.cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const parsedOrderId = parseInt(orderId, 10);

        if (isNaN(parsedOrderId)) {
            return res.status(400).json({ message: "Invalid Order ID." });
        }

        const currentOrder = await prisma.order.findUnique({
            where: { id: parsedOrderId }
        });

        if (!currentOrder) {
            return res.status(404).json({ message: "Order not found." });
        }

        if (currentOrder.billStatus !== BillStatus.OPEN) {
            return res.status(400).json({ message: `Cannot cancel. Order status is ${currentOrder.billStatus}.` });
        }

        const cancelledOrder = await prisma.order.update({
            where: { id: parsedOrderId },
            data: {
                billStatus: BillStatus.CANCELLED, // ใช้ Enum
            },
            include: { // <-- แก้ไข include
                employee: true,
                table: true,
                orderRounds: {
                    include: {
                        orderDetails: { include: { food: true, drink: true } }
                    },
                    orderBy: { roundNumber: 'asc' }
                },
            }
        });

        res.json({ message: "Order cancelled successfully", order: cancelledOrder });

    } catch (error) {
        console.error("Error cancelling order:", error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: "Order not found." });
        }
        res.status(500).json({ message: "Server Error cancelling order", error: error.message });
    }
};

exports.updateRoundKitchenStatus = async (req, res) => {
    try {
        // 1. รับค่า roundId จาก URL parameters
        const { roundId } = req.params;
        // 2. รับค่า status ใหม่จาก Request Body
        const { status } = req.body;

        // 3. แปลง roundId เป็นตัวเลข (Integer)
        const parsedRoundId = parseInt(roundId, 10);

        // 4. ตรวจสอบว่า roundId เป็นตัวเลขที่ถูกต้องหรือไม่
        if (isNaN(parsedRoundId)) {
            return res.status(400).json({ message: "Invalid Order Round ID format. Must be a number." });
        }

        // 5. ตรวจสอบว่า status ที่ส่งมา มีค่าตรงกับ Enum KitchenStatus หรือไม่
        if (!status || !Object.values(KitchenStatus).includes(status)) {
            return res.status(400).json({
                message: `Invalid or missing kitchen status. Must be one of: ${Object.values(KitchenStatus).join(', ')}`
            });
        }

        // 6. ทำการอัปเดตข้อมูลในฐานข้อมูล
        const updatedRound = await prisma.orderRound.update({
            where: {
                id: parsedRoundId, // ใช้ ID ที่แปลงแล้วในการค้นหา
            },
            data: {
                kitchenStatus: status, // กำหนดค่า kitchenStatus ใหม่
            },
            include: {
                // ส่งข้อมูล OrderDetail กลับไปด้วย (ถ้าต้องการ)
                orderDetails: {
                    include: {
                        food: true,
                        drink: true,
                    },
                },
                // ส่งข้อมูล Order หลักกลับไปด้วย (ถ้าต้องการ)
                order: {
                    include: {
                        table: true,
                    }
                }
            },
        });

        // 7. ส่งข้อมูลที่อัปเดตแล้วกลับไปเป็น JSON response
        console.log(`OrderRound ID: ${parsedRoundId} updated to status: ${status}`);
        res.status(200).json(updatedRound);

    } catch (error) {
        console.error("Error updating order round status:", error);

        // 8. จัดการ Error ที่อาจเกิดขึ้น
        // กรณีหา Record ที่จะอัปเดตไม่เจอ (Prisma Code P2025)
        if (error.code === 'P2025') {
            return res.status(404).json({ message: `Order Round with ID ${req.params.roundId} not found.` });
        }

        // Error อื่นๆ ที่ไม่คาดคิด
        res.status(500).json({ message: "Server Error updating order round status", error: error.message });
    }
};

// =================================================================
// 5. ดึงข้อมูลออเดอร์ทั้งหมด (แก้ include)
// =================================================================
exports.getAllOrders = async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            include: {
                employee: true,
                table: true,
                orderRounds: {
                    include: {
                        orderDetails: {
                            include: {
                                food: {
                                    include: { category: true } // ກວດສອບຊື່ນີ້ໃນ schema ຂອງທ່ານນຳ
                                },
                                drink: {
                                    include: { Category: true } //  <-- ❗️ ແກ້ໄຂແລ້ວ: ປ່ຽນເປັນໂຕ C ໃຫຍ່ ❗️
                                }
                            }
                        }
                    },
                    orderBy: { roundNumber: 'asc' }
                },
            },
            orderBy: {
                createdAt: 'desc',
            }
        });
        res.json(orders);
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: "Server Error fetching orders", error: error.message });
    }
};

// =================================================================
// 6. ดึงข้อมูลออเดอร์ตาม ID (แก้ include)
// =================================_
exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const orderId = parseInt(id, 10);

        if (isNaN(orderId)) {
            return res.status(400).json({ message: "Invalid Order ID format." });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { // <-- แก้ไข include
                employee: true,
                table: true,
                orderRounds: {
                    include: {
                        orderDetails: { include: { food: true, drink: true } }
                    },
                    orderBy: { roundNumber: 'asc' }
                },
            }
        });

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        res.json(order);
    } catch (error) {
        console.error("Error fetching order by ID:", error);
        res.status(500).json({ message: "Server Error fetching order", error: error.message });
    }
};

// =================================================================
// 7. ดึงข้อมูลออเดอร์ที่ 'OPEN' อยู่ตาม Table ID (แก้ include)
// =================================================================
exports.getOpenOrderByTableId = async (req, res) => {
    try {
        const { tableId } = req.params;
        const parsedTableId = parseInt(tableId, 10);

        if (isNaN(parsedTableId)) {
            return res.status(400).json({ message: "Invalid Table ID format." });
        }

        const order = await prisma.order.findFirst({
            where: {
                tableId: parsedTableId,
                billStatus: BillStatus.OPEN, // ใช้ Enum
            },
            include: { // <-- แก้ไข include
                employee: true,
                table: true,
                orderRounds: {
                    include: {
                        orderDetails: { include: { food: true, drink: true } }
                    },
                    orderBy: { roundNumber: 'asc' }
                },
            }
        });

        if (!order) {
            return res.status(404).json({ message: "No open order found for this table." });
        }

        res.json(order);
    } catch (error) {
        console.error("Error fetching open order by table:", error);
        res.status(500).json({ message: "Server Error fetching order", error: error.message });
    }
};


// =================================================================
// 8. ลบออเดอร์ (ปรับปรุงให้ลบ Order หลัก - ถ้า Schema มี Cascade จะลบ Round/Detail ด้วย)
// =================================================================
exports.deleteOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const orderId = parseInt(id, 10);

        if (isNaN(orderId)) {
            return res.status(400).json({ message: "Invalid Order ID format." });
        }

        // เราจะลบ Order หลัก ถ้า Schema ตั้ง onDelete: Cascade ไว้
        // OrderRound และ OrderDetail ที่เกี่ยวข้องจะถูกลบไปด้วย
        // **ตรวจสอบให้แน่ใจว่าคุณได้ตั้ง onDelete: Cascade ใน Schema!**
        await prisma.order.delete({
            where: { id: orderId }
        });

        res.json({ message: "Order and its rounds/details deleted successfully" });

    } catch (error) {
        console.error("Error deleting order:", error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: "Order not found" });
        }
        res.status(500).json({ message: "Server Error deleting order", error: error.message });
    }
};


// =================================================================
// 9. รายงานยอดขาย (แก้ไขการนับ totalItems)
// =================================================================
exports.getOrderReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const whereClause = { billStatus: BillStatus.PAID }; // ใช้ Enum

        if (startDate && endDate) {
            whereClause.updatedAt = {
                gte: new Date(startDate),
                lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
            };
        }

        const [orders, totalRevenue, totalItems] = await Promise.all([
            prisma.order.findMany({
                where: whereClause,
                include: { // <-- แก้ไข include
                    employee: true,
                    table: true,
                    orderRounds: {
                        include: { orderDetails: true }
                    },
                }
            }),
            prisma.order.aggregate({
                _sum: { total_price: true },
                where: whereClause
            }),
            // <-- แก้ไขการนับ Item: ต้องกรองผ่าน OrderRound -> Order
            prisma.orderDetail.aggregate({
                _sum: { quantity: true },
                where: {
                    orderRound: { // กรองผ่าน OrderRound
                        order: whereClause // ใช้ whereClause หลักที่นี่
                    }
                }
            })
        ]);

        res.json({
            totalOrders: orders.length,
            totalRevenue: totalRevenue._sum.total_price || 0,
            totalItemsSold: totalItems._sum.quantity || 0,
            orders
        });

    } catch (error) {
        console.error("Error generating order report:", error);
        res.status(500).json({ message: "Server Error generating report", error: error.message });
    }
};

// =================================================================
// 10. รายงานรายรับ-รายจ่าย (ไม่เปลี่ยนแปลง)
// =================================================================
exports.getIncomeExpenseReport = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const incomeOrders = await prisma.order.findMany({
            where: {
                billStatus: BillStatus.PAID, // ใช้ Enum
                updatedAt: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            },
            select: { id: true, total_price: true, updatedAt: true }
        });

        const expenseReceipts = await prisma.importReceipt.findMany({
            where: {
                status: "approved", // <-- ต้องแน่ใจว่ามี status นี้
                createdAt: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            },
            select: { id: true, totalPrice: true, createdAt: true }
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
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};