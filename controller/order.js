const prisma = require('../config/prisma');
const { KitchenStatus, BillStatus, PaymentMethod } = require('@prisma/client');

/**
 * Helper function to prepare order details by fetching latest prices from the database.
 * This enhances security by not trusting prices sent from the client.
 * @param {Array} orderDetails - The array of items from the request body.
 * @returns {Promise<Array>} - A promise that resolves to the validated and priced details.
 */
const prepareAndValidateDetails = async (orderDetails) => {
    // Collect all unique IDs for food and product units to fetch them in one go
    const foodIds = [...new Set(orderDetails.filter(d => d.foodId).map(d => parseInt(d.foodId, 10)))];
    const productUnitIds = [...new Set(orderDetails.filter(d => d.productUnitId).map(d => parseInt(d.productUnitId, 10)))];

    // Fetch all required data from the database concurrently
    const [foodsFromDb, productUnitsFromDb] = await Promise.all([
        foodIds.length > 0 ? prisma.food.findMany({ where: { id: { in: foodIds } } }) : Promise.resolve([]),
        productUnitIds.length > 0 ? prisma.productUnit.findMany({ where: { id: { in: productUnitIds } } }) : Promise.resolve([])
    ]);

    // Create maps for quick lookups
    const foodMap = new Map(foodsFromDb.map(f => [f.id, f]));
    const productUnitMap = new Map(productUnitsFromDb.map(p => [p.id, p]));

    // Validate each item and use the price from the database
    return orderDetails.map(item => {
        const quantity = parseInt(item.quantity, 10);
        if (isNaN(quantity) || quantity <= 0) {
            throw new Error(`Invalid quantity for item: ${JSON.stringify(item)}`);
        }

        let validatedItem;
        // ✨ FIX: แยก Logic การทำงานสำหรับอาหารและเครื่องดื่มอย่างชัดเจน
        if (item.foodId) {
            // กรณีนี้คือ "อาหาร" ซึ่งไม่มี unit/productUnit
            const food = foodMap.get(parseInt(item.foodId, 10));
            if (!food) throw new Error(`Food with ID ${item.foodId} not found.`);
            validatedItem = { foodId: food.id, quantity, price: food.price };
        } else if (item.productUnitId) {
            // กรณีนี้คือ "เครื่องดื่ม" ซึ่งจะถูกขายผ่าน productUnit
            const productUnit = productUnitMap.get(parseInt(item.productUnitId, 10));
            if (!productUnit) throw new Error(`ProductUnit with ID ${item.productUnitId} not found.`);
            validatedItem = { productUnitId: productUnit.id, quantity, price: productUnit.price };
        } else {
            // This error should ideally not be hit if the input is pre-filtered.
            throw new Error('OrderDetail item must have either foodId or productUnitId');
        }
        return validatedItem;
    });
};


// =================================================================
// 1. เพิ่มรายการอาหาร/เครื่องดื่มในโต๊ะ (✨ แก้ไข: เพิ่มการตัดสต็อกที่นี่)
// =================================================================
exports.addOrderToTable = async (req, res) => {
    try {
        const { empId, tableId, orderDetails } = req.body;

        if (!empId || !tableId || !orderDetails || !Array.isArray(orderDetails)) {
            return res.status(400).json({ message: "Employee ID, Table ID, and order details are required." });
        }

        const validItems = orderDetails.filter(d => d && (d.foodId || d.productUnitId));

        if (validItems.length === 0) {
            return res.status(400).json({ message: "No valid items provided in the order details." });
        }

        const validatedDetails = await prepareAndValidateDetails(validItems);
        const newItemsTotalPrice = validatedDetails.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // --- 1. STOCK CHECK (ยังคงเดิมเพื่อตรวจสอบก่อน) ---
        const stockRequirements = new Map();
        const productUnitIdsForStockCheck = validatedDetails
            .filter(d => d.productUnitId)
            .map(d => d.productUnitId);

        if (productUnitIdsForStockCheck.length > 0) {
            const productUnitsFromDb = await prisma.productUnit.findMany({
                where: { id: { in: productUnitIdsForStockCheck } },
                select: { id: true, drinkId: true, baseItemsCount: true }
            });
            const productUnitMap = new Map(productUnitsFromDb.map(p => [p.id, p]));

            for (const detail of validatedDetails) {
                if (detail.productUnitId) {
                    const unitInfo = productUnitMap.get(detail.productUnitId);
                    if (unitInfo) {
                        const quantityNeeded = detail.quantity * unitInfo.baseItemsCount;
                        stockRequirements.set(unitInfo.drinkId, (stockRequirements.get(unitInfo.drinkId) || 0) + quantityNeeded);
                    }
                }
            }
        }

        if (stockRequirements.size > 0) {
            const drinkIds = Array.from(stockRequirements.keys());
            const drinksInStock = await prisma.drink.findMany({
                where: { id: { in: drinkIds } },
                select: { id: true, name: true, qty: true }
            });

            for (const drink of drinksInStock) {
                if (drink.qty <= 0) {
                    return res.status(400).json({ message: `ເຄື່ອງດື່ມນີ້ໝົດສະຕ໊ອກ! (${drink.name})` });
                }
                const requiredQty = stockRequirements.get(drink.id);
                if (drink.qty < requiredQty) {
                    return res.status(400).json({ message: `ສິນຄ້າໃນຄັງບໍ່ພຽງພໍ (${drink.name}). ຕ້ອງການ: ${requiredQty}, ມີຢູ່: ${drink.qty}` });
                }
            }
        }

        const parsedTableId = parseInt(tableId, 10);
        const parsedEmpId = parseInt(empId, 10);

        // --- 2. TRANSACTION (สร้างออเดอร์ + ตัดสต็อก) ---
        const resultOrder = await prisma.$transaction(async (tx) => {
            // ... (ส่วนการสร้าง Order, OrderRound, OrderDetail เหมือนเดิม) ...
            let mainOrder = await tx.order.findFirst({
                where: { tableId: parsedTableId, billStatus: BillStatus.OPEN },
            });
            if (!mainOrder) {
                mainOrder = await tx.order.create({ data: { empId: parsedEmpId, tableId: parsedTableId, total_price: newItemsTotalPrice, billStatus: BillStatus.OPEN } });
            } else {
                mainOrder = await tx.order.update({ where: { id: mainOrder.id }, data: { total_price: { increment: newItemsTotalPrice }, empId: parsedEmpId } });
            }
            const lastRound = await tx.orderRound.findFirst({ where: { orderId: mainOrder.id }, orderBy: { roundNumber: 'desc' } });
            const nextRoundNumber = (lastRound?.roundNumber || 0) + 1;
            const newOrderRound = await tx.orderRound.create({ data: { orderId: mainOrder.id, roundNumber: nextRoundNumber, kitchenStatus: KitchenStatus.PENDING } });
            const detailCreations = validatedDetails.map(detail => tx.orderDetail.create({ data: { orderRoundId: newOrderRound.id, foodId: detail.foodId, productUnitId: detail.productUnitId, quantity: detail.quantity, price: detail.price } }));
            await Promise.all(detailCreations);

            // --- ✨ 2.1. เพิ่มส่วนตัดสต็อกเข้ามาใน Transaction นี้ ---
            if (stockRequirements.size > 0) {
                const stockUpdates = Array.from(stockRequirements.entries()).map(([drinkId, quantityToDecrement]) =>
                    tx.drink.update({
                        where: { id: drinkId },
                        data: { qty: { decrement: quantityToDecrement } }
                    })
                );
                await Promise.all(stockUpdates);
            }

            // ... (ส่วนการอัปเดตสถานะโต๊ะและ return ค่าเหมือนเดิม) ...
            await tx.table.update({ where: { id: parsedTableId }, data: { status: 'ຖືກຈອງແລ້ວ' } });
            return tx.order.findUnique({ where: { id: mainOrder.id }, include: FULL_ORDER_INCLUDE });
        }, { timeout: 15000 });

        res.status(201).json(resultOrder);

    } catch (error) {
        console.error("Error creating/updating order:", error);
        res.status(500).json({ message: "Server Error processing order", error: error.message });
    }
};

// =================================================================
// 2. ชำระเงิน / ปิดบิล (✨ แก้ไข: นำการตัดสต็อกออก)
// =================================================================
exports.checkoutOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { paymentMethod } = req.body;

        if (!paymentMethod || !Object.values(PaymentMethod).includes(paymentMethod)) {
            return res.status(400).json({ message: "Invalid payment method." });
        }

        const parsedOrderId = parseInt(orderId, 10);

        // Transaction จะเหลือแค่การอัปเดตสถานะ Order และ Table
        const updatedOrder = await prisma.$transaction(async (tx) => {
            const currentOrder = await tx.order.findUnique({
                where: { id: parsedOrderId },
                include: { table: true } // ดึงแค่โต๊ะมาเพื่ออัปเดตสถานะ
            });

            if (!currentOrder || currentOrder.billStatus !== BillStatus.OPEN) {
                throw new Error("Order not found or is not OPEN.");
            }

            // --- ส่วนการคำนวณและตัดสต็อกถูกลบออกจากที่นี่ ---

            if (currentOrder.tableId) {
                await tx.table.update({
                    where: { id: currentOrder.tableId },
                    data: { status: 'ວ່າງ' }
                });
            }

            return tx.order.update({
                where: { id: parsedOrderId },
                data: {
                    billStatus: BillStatus.PAID,
                    payment_method: paymentMethod,
                },
                include: FULL_ORDER_INCLUDE // ใช้ helper เพื่อส่งข้อมูลกลับให้สมบูรณ์
            });
        }, { timeout: 20000 });

        res.json({
            message: "Order paid successfully and table status updated.",
            order: updatedOrder
        });

    } catch (error) {
        console.error("Error checking out order:", error);
        res.status(500).json({ message: "Server Error during checkout", error: error.message });
    }
};

// Helper for consistent include structure
const FULL_ORDER_INCLUDE = {
    employee: true,
    table: true,
    orderRounds: {
        orderBy: { roundNumber: 'asc' },
        include: {
            orderDetails: {
                include: {
                    food: true,
                    productUnit: { include: { drink: true } }
                }
            }
        }
    },
};

// =================================================================
// 3. ยกเลิกออเดอร์ (✨ แก้ไข: เพิ่มการคืนสต็อก)
// =================================================================
exports.cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const parsedOrderId = parseInt(orderId, 10);

        const cancelledOrder = await prisma.$transaction(async (tx) => {
            // 1. ดึงข้อมูลออเดอร์ที่จะยกเลิก
            const orderToCancel = await tx.order.findUnique({
                where: { id: parsedOrderId },
                include: {
                    orderRounds: {
                        include: {
                            orderDetails: {
                                include: { productUnit: true }
                            }
                        }
                    }
                }
            });

            if (!orderToCancel) {
                throw new Error("Order not found");
            }

            // ไม่สามารถยกเลิกออเดอร์ที่ชำระเงินแล้วได้
            if (orderToCancel.billStatus === BillStatus.PAID) {
                throw new Error("Cannot cancel an already paid order.");
            }

            // 2. คำนวณสต็อกที่ต้องคืน
            const stockToReturn = new Map();
            for (const round of orderToCancel.orderRounds) {
                for (const detail of round.orderDetails) {
                    if (detail.productUnitId && detail.productUnit) {
                        const { drinkId, baseItemsCount } = detail.productUnit;
                        const quantityToReturn = detail.quantity * baseItemsCount;
                        stockToReturn.set(drinkId, (stockToReturn.get(drinkId) || 0) + quantityToReturn);
                    }
                }
            }

            // 3. คืนสต็อก
            if (stockToReturn.size > 0) {
                const stockUpdates = Array.from(stockToReturn.entries()).map(([drinkId, quantityToIncrement]) =>
                    tx.drink.update({
                        where: { id: drinkId },
                        data: { qty: { increment: quantityToIncrement } }
                    })
                );
                await Promise.all(stockUpdates);
            }

            // 4. อัปเดตสถานะออเดอร์เป็น CANCELLED
            return tx.order.update({
                where: { id: parsedOrderId },
                data: { billStatus: BillStatus.CANCELLED },
                include: FULL_ORDER_INCLUDE
            });
        });

        res.json({ message: "Order cancelled successfully and stock restored.", order: cancelledOrder });
    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ message: "Server Error cancelling order", error: error.message });
    }
};

// (ฟังก์ชันอื่นๆ ที่เหลือยังคงเหมือนเดิม)
// ...
// =================================================================
// 4. อัปเดตสถานะครัว
// =================================================================
exports.updateRoundKitchenStatus = async (req, res) => {
    try {
        const { roundId } = req.params;
        const { status } = req.body;

        if (!status || !Object.values(KitchenStatus).includes(status)) {
            return res.status(400).json({ message: "Invalid kitchen status provided." });
        }

        const updatedRound = await prisma.orderRound.update({
            where: { id: parseInt(roundId, 10) },
            data: { kitchenStatus: status },
            include: {
                orderDetails: {
                    include: {
                        food: true,
                        productUnit: { include: { drink: true } }
                    },
                },
                order: { include: { table: true } }
            },
        });

        res.status(200).json(updatedRound);
    } catch (error) {
        console.error("Error updating order round status:", error);
        res.status(500).json({ message: "Server Error updating order round status", error: error.message });
    }
};

// =================================================================
// 5. ดึงข้อมูลออเดอร์ทั้งหมด
// =================================================================
exports.getAllOrders = async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            include: FULL_ORDER_INCLUDE,
            orderBy: { updatedAt: 'desc' }
        });
        res.json(orders);
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ message: "Server Error fetching orders", error: error.message });
    }
};

// =================================================================
// 6. ดึงข้อมูลออเดอร์ตาม ID
// =================================================================
exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma.order.findUnique({
            where: { id: parseInt(id, 10) },
            include: FULL_ORDER_INCLUDE
        });

        if (!order) return res.status(404).json({ message: "Order not found" });
        res.json(order);
    } catch (error) {
        console.error("Error fetching order by ID:", error);
        res.status(500).json({ message: "Server Error fetching order", error: error.message });
    }
};

// =================================================================
// 7. ดึงข้อมูลออเดอร์ที่ 'OPEN' อยู่ตาม Table ID
// =================================================================
exports.getOpenOrderByTableId = async (req, res) => {
    try {
        const { tableId } = req.params;
        const order = await prisma.order.findFirst({
            where: {
                tableId: parseInt(tableId, 10),
                billStatus: BillStatus.OPEN,
            },
            include: FULL_ORDER_INCLUDE
        });

        if (!order) return res.status(404).json({ message: "No open order found for this table." });
        res.json(order);
    } catch (error) {
        console.error("Error fetching open order by table:", error);
        res.status(500).json({ message: "Server Error fetching order", error: error.message });
    }
};

// =================================================================
// 8. ลบออเดอร์
// =================================================================
exports.deleteOrder = async (req, res) => {
    try {
        const { id } = req.params;
        // Caution: Deleting an order directly might not restock items if stock was deducted on creation.
        // The `cancelOrder` flow is generally safer.
        await prisma.order.delete({ where: { id: parseInt(id, 10) } });
        res.json({ message: "Order and its related data deleted successfully" });
    } catch (error) {
        console.error("Error deleting order:", error);
        if (error.code === 'P2025') {
            return res.status(404).json({ message: "Order to delete not found." });
        }
        res.status(500).json({ message: "Server Error deleting order", error: error.message });
    }
};

// =================================================================
// 9. รายงานยอดขาย
// =================================================================
exports.getOrderReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const whereClause = { billStatus: BillStatus.PAID };

        if (startDate && endDate) {
            whereClause.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate),
            };
        }

        const [orders, totalRevenue, totalItems] = await Promise.all([
            prisma.order.findMany({
                where: whereClause,
                include: FULL_ORDER_INCLUDE
            }),
            prisma.order.aggregate({ _sum: { total_price: true }, where: whereClause }),
            prisma.orderDetail.aggregate({ _sum: { quantity: true }, where: { orderRound: { order: whereClause } } })
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
// 10. รายงานรายรับ-รายจ่าย
// =================================================================
exports.getIncomeExpenseReport = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);

        const [totalIncomeResult, totalExpenseResult] = await Promise.all([
            prisma.order.aggregate({
                _sum: { total_price: true },
                where: {
                    billStatus: BillStatus.PAID,
                    updatedAt: { gte: startOfMonth, lte: endOfMonth }
                }
            }),
            prisma.importReceipt.aggregate({
                _sum: { totalPrice: true },
                where: {
                    status: "completed",
                    importDate: { gte: startOfMonth, lte: endOfMonth }
                }
            })
        ]);
        const totalIncome = totalIncomeResult._sum.total_price || 0;
        const totalExpense = totalExpenseResult._sum.totalPrice || 0;

        res.json({
            period: { from: startOfMonth.toISOString(), to: endOfMonth.toISOString() },
            totalIncome,
            totalExpense,
            netProfit: totalIncome - totalExpense,
        });
    } catch (error) {
        console.error("Error generating monthly income/expense report:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};
