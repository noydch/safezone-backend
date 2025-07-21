const prisma = require('../config/prisma');
const { KitchenStatus, BillStatus, PaymentMethod } = require('@prisma/client');

// โครงสร้าง FULL_ORDER_INCLUDE สำหรับการดึงข้อมูลออเดอร์อย่างละเอียด
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

/**
 * ฟังก์ชันช่วยเตรียมและตรวจสอบรายละเอียดออเดอร์ (อาหารและเครื่องดื่ม)
 * โดยดึงราคาจากฐานข้อมูลแทนการเชื่อถือราคาที่มาจาก client
 */
const prepareAndValidateDetails = async (orderDetails) => {
    const foodIds = [...new Set(orderDetails.filter(d => d.foodId).map(d => parseInt(d.foodId, 10)))];
    const productUnitIds = [...new Set(orderDetails.filter(d => d.productUnitId).map(d => parseInt(d.productUnitId, 10)))];

    const [foodsFromDb, productUnitsFromDb] = await Promise.all([
        foodIds.length > 0 ? prisma.food.findMany({ where: { id: { in: foodIds } } }) : Promise.resolve([]),
        productUnitIds.length > 0 ? prisma.productUnit.findMany({ where: { id: { in: productUnitIds } } }) : Promise.resolve([])
    ]);

    const foodMap = new Map(foodsFromDb.map(f => [f.id, f]));
    const productUnitMap = new Map(productUnitsFromDb.map(p => [p.id, p]));

    return orderDetails.map(item => {
        const quantity = parseInt(item.quantity, 10);
        if (isNaN(quantity) || quantity <= 0) {
            throw new Error(`Invalid quantity for item: ${JSON.stringify(item)}`);
        }

        let validatedItem;
        if (item.foodId) {
            const food = foodMap.get(parseInt(item.foodId, 10));
            if (!food) throw new Error(`Food with ID ${item.foodId} not found.`);
            validatedItem = { foodId: food.id, quantity, price: food.price };
        } else if (item.productUnitId) {
            const productUnit = productUnitMap.get(parseInt(item.productUnitId, 10));
            if (!productUnit) throw new Error(`ProductUnit with ID ${item.productUnitId} not found.`);
            validatedItem = { productUnitId: productUnit.id, quantity, price: productUnit.price };
        } else {
            throw new Error('OrderDetail item must have either foodId or productUnitId');
        }
        return validatedItem;
    });
};

// =================================================================
// 1. เพิ่มรายการอาหาร/เครื่องดื่มในโต๊ะ พร้อมตัดสต็อกและอัปเดตสถานะการจอง
// =================================================================
exports.addOrderToTable = async (req, res) => {
    try {
        const { empId, tableId, orderDetails } = req.body;

        if (!empId || !tableId || !orderDetails || !Array.isArray(orderDetails)) {
            return res.status(400).json({ message: "ต้องระบุรหัสพนักงาน, รหัสโต๊ะ และรายละเอียดออเดอร์" });
        }

        const validItems = orderDetails.filter(d => d && (d.foodId || d.productUnitId));
        if (validItems.length === 0) {
            return res.status(400).json({ message: "ไม่มีรายการที่ถูกต้องในรายละเอียดออเดอร์" });
        }

        const validatedDetails = await prepareAndValidateDetails(validItems);
        const newItemsTotalPrice = validatedDetails.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // ตรวจสอบสต็อกเครื่องดื่ม
        const stockRequirements = new Map();
        const productUnitIdsForStockCheck = validatedDetails.filter(d => d.productUnitId).map(d => d.productUnitId);

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

        // ดึงข้อมูลโต๊ะเพื่อเช็ค mergedName
        const tableInfo = await prisma.table.findUnique({ where: { id: parsedTableId } });
        const mergedFromIdsStr = tableInfo?.mergedName || null;  // ถ้าโต๊ะถูกรวม จะมี mergedName

        // Transaction สร้าง/อัปเดต Order + ตัดสต็อก + อัปเดตสถานะโต๊ะและการจอง
        const resultOrder = await prisma.$transaction(async (tx) => {
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
                        mergedFromIds: mergedFromIdsStr,  // บันทึก mergedName (merge info) ลง order ด้วย
                    }
                });
            } else {
                mainOrder = await tx.order.update({
                    where: { id: mainOrder.id },
                    data: { total_price: { increment: newItemsTotalPrice }, empId: parsedEmpId, mergedFromIds: mergedFromIdsStr }
                });
            }

            const lastRound = await tx.orderRound.findFirst({
                where: { orderId: mainOrder.id },
                orderBy: { roundNumber: 'desc' }
            });
            const nextRoundNumber = (lastRound?.roundNumber || 0) + 1;

            const containsFood = validatedDetails.some(detail => detail.foodId);
            const initialKitchenStatus = containsFood ? KitchenStatus.PENDING : KitchenStatus.SERVED;

            const newOrderRound = await tx.orderRound.create({
                data: {
                    orderId: mainOrder.id,
                    roundNumber: nextRoundNumber,
                    kitchenStatus: initialKitchenStatus
                }
            });

            const detailCreations = validatedDetails.map(detail => tx.orderDetail.create({
                data: {
                    orderRoundId: newOrderRound.id,
                    foodId: detail.foodId,
                    productUnitId: detail.productUnitId,
                    quantity: detail.quantity,
                    price: detail.price
                }
            }));
            await Promise.all(detailCreations);

            if (stockRequirements.size > 0) {
                const stockUpdates = Array.from(stockRequirements.entries()).map(([drinkId, qty]) =>
                    tx.drink.update({
                        where: { id: drinkId },
                        data: { qty: { decrement: qty } }
                    })
                );
                await Promise.all(stockUpdates);
            }

            await tx.table.update({ where: { id: parsedTableId }, data: { status: 'ກຳລັງໃຊ້ງານ' } });

            // อัปเดตสถานะการจองจาก 'pending' เป็น 'confirmed'
            const existingPendingReservation = await tx.reservation.findFirst({
                where: { tableId: parsedTableId, status: 'pending' },
                orderBy: { reservationTime: 'asc' }
            });

            if (existingPendingReservation) {
                await tx.reservation.update({
                    where: { id: existingPendingReservation.id },
                    data: { status: 'confirmed' }
                });
            }

            return tx.order.findUnique({ where: { id: mainOrder.id }, include: FULL_ORDER_INCLUDE });
        }, { timeout: 15000 });

        res.status(201).json(resultOrder);

    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการสร้างออเดอร์:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดของเซิร์ฟเวอร์", error: error.message });
    }
};


// =================================================================
// 2. ชำระเงิน / ปิดบิล (นำการตัดสต็อกออก)
// =================================================================
exports.checkoutOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { paymentMethod } = req.body;

        if (!paymentMethod || !Object.values(PaymentMethod).includes(paymentMethod)) {
            return res.status(400).json({ message: "วิธีการชำระเงินไม่ถูกต้อง" });
        }

        const parsedOrderId = parseInt(orderId, 10);

        const updatedOrder = await prisma.$transaction(async (tx) => {
            const currentOrder = await tx.order.findUnique({
                where: { id: parsedOrderId },
                include: { table: true }
            });

            if (!currentOrder || currentOrder.billStatus !== BillStatus.OPEN) {
                throw new Error("ไม่พบออเดอร์หรือออเดอร์ไม่ได้อยู่ในสถานะ OPEN");
            }

            if (currentOrder.tableId) {
                await tx.table.update({
                    where: { id: currentOrder.tableId },
                    data: { status: 'ວ່າງ' }
                });
            }

            const orderResult = await tx.order.update({
                where: { id: parsedOrderId },
                data: {
                    billStatus: BillStatus.PAID,
                    payment_method: paymentMethod,
                },
                include: FULL_ORDER_INCLUDE
            });

            // เปลี่ยนสถานะการจองเป็น 'cancelled'
            const existingReservation = await tx.reservation.findFirst({
                where: {
                    tableId: currentOrder.tableId,
                    status: { notIn: ['cancelled', 'completed'] }
                },
                orderBy: { reservationTime: 'asc' }
            });

            if (existingReservation) {
                await tx.reservation.update({
                    where: { id: existingReservation.id },
                    data: { status: 'cancelled' }
                });
            }

            return orderResult;
        }, { timeout: 20000 });

        res.json({ message: "ชำระเงินออเดอร์สำเร็จและอัปเดตสถานะโต๊ะแล้ว", order: updatedOrder });

    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการชำระเงินออเดอร์:", error);
        res.status(500).json({ message: "เกิดข้อผิดพลาดของเซิร์ฟเวอร์ระหว่างการชำระเงิน", error: error.message });
    }
};

// =================================================================
// 3. ยกเลิกออเดอร์ พร้อมคืนสต็อก
// =================================================================
exports.cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const parsedOrderId = parseInt(orderId, 10);

        const cancelledOrder = await prisma.$transaction(async (tx) => {
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

            if (!orderToCancel) throw new Error("Order not found");
            if (orderToCancel.billStatus === BillStatus.PAID) {
                throw new Error("Cannot cancel an already paid order.");
            }

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

            if (stockToReturn.size > 0) {
                const stockUpdates = Array.from(stockToReturn.entries()).map(([drinkId, qty]) =>
                    tx.drink.update({
                        where: { id: drinkId },
                        data: { qty: { increment: qty } }
                    })
                );
                await Promise.all(stockUpdates);
            }

            return tx.order.update({
                where: { id: parsedOrderId },
                data: { billStatus: BillStatus.CANCELLED },
                include: FULL_ORDER_INCLUDE
            });
        });

        res.json({ message: "ยกเลิกออเดอร์เรียบร้อย และคืนสต็อกแล้ว", order: cancelledOrder });
    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ message: "Server Error cancelling order", error: error.message });
    }
};

// =================================================================
// 4. อัปเดตสถานะครัว (OrderRound)
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
// 7. ดึงข้อมูลออเดอร์ที่เปิดอยู่ (OPEN) ตาม Table ID
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
// 8. ลบออเดอร์ (ระวังไม่คืนสต็อก)
// =================================================================
exports.deleteOrder = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.order.delete({ where: { id: parseInt(id, 10) } });
        res.json({ message: "ลบออเดอร์เรียบร้อย" });
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
            prisma.orderDetail.aggregate({
                _sum: { quantity: true },
                where: {
                    orderRound: { order: { billStatus: BillStatus.PAID } }
                }
            })
        ]);

        res.json({
            orders,
            totalRevenue: totalRevenue._sum.total_price || 0,
            totalItems: totalItems._sum.quantity || 0,
        });
    } catch (error) {
        console.error("Error generating report:", error);
        res.status(500).json({ message: "Server Error generating report", error: error.message });
    }
};

// =================================================================
// 10. ย้ายโต๊ะ (moveTable)
// =================================================================
exports.moveTable = async (req, res) => {
    try {
        const { fromTableId, toTableId } = req.body;

        if (!fromTableId || !toTableId || fromTableId === toTableId) {
            return res.status(400).json({ message: "ต้องระบุโต๊ะต้นทางและโต๊ะปลายทางที่แตกต่างกัน" });
        }

        const fromTable = await prisma.table.findUnique({ where: { id: fromTableId } });
        const toTable = await prisma.table.findUnique({ where: { id: toTableId } });

        if (!fromTable || !toTable) {
            return res.status(404).json({ message: "ไม่พบโต๊ะต้นทางหรือปลายทาง" });
        }

        if (toTable.status !== "ວ່າງ") {
            return res.status(400).json({ message: "โต๊ะปลายทางไม่ว่าง" });
        }

        const openOrder = await prisma.order.findFirst({
            where: { tableId: fromTableId, billStatus: BillStatus.OPEN }
        });

        if (!openOrder) {
            return res.status(400).json({ message: "โต๊ะต้นทางไม่มีออเดอร์เปิดอยู่" });
        }

        await prisma.$transaction(async (tx) => {
            await tx.order.update({
                where: { id: openOrder.id },
                data: { tableId: toTableId }
            });

            await tx.table.update({ where: { id: fromTableId }, data: { status: "ວ່າງ" } });
            await tx.table.update({ where: { id: toTableId }, data: { status: "ກຳລັງໃຊ້ງານ" } });
        });

        res.json({ message: "ย้ายโต๊ะสำเร็จ" });
    } catch (error) {
        console.error("Error moving table:", error);
        res.status(500).json({ message: "Server Error moving table", error: error.message });
    }
};

// =================================================================
// 11. รวมโต๊ะ (mergeTable)
// =================================================================
exports.mergeTable = async (req, res) => {
    try {
        const { tableIds } = req.body;

        if (!tableIds || !Array.isArray(tableIds) || tableIds.length < 2) {
            return res.status(400).json({ message: "ต้องเลือกโต๊ะอย่างน้อย 2 โต๊ะเพื่อรวม" });
        }

        const tables = await prisma.table.findMany({
            where: { id: { in: tableIds } }
        });

        if (tables.length !== tableIds.length) {
            return res.status(404).json({ message: "โต๊ะที่เลือกบางโต๊ะไม่พบในระบบ" });
        }

        const hasUnavailable = tables.some(t => t.status !== "ວ່າງ");
        if (hasUnavailable) {
            return res.status(400).json({ message: "ไม่สามารถรวมโต๊ะที่ไม่ว่างได้" });
        }

        const mainTableId = tableIds[0];
        const otherTableIds = tableIds.slice(1);
        const mergedFromIdsStr = tableIds.join(',');

        const mergedName = tables
            .map(t => (t.name ? t.name : `ໂຕະ ${t.table_number}`))
            .join('+ ');

        // หา order โต๊ะหลัก หรือสร้างใหม่ถ้ายังไม่มี
        let mainOrder = await prisma.order.findFirst({
            where: {
                tableId: mainTableId,
                billStatus: BillStatus.OPEN
            }
        });

        if (!mainOrder) {
            mainOrder = await prisma.order.create({
                data: {
                    tableId: mainTableId,
                    total_price: 0,
                    billStatus: BillStatus.OPEN,
                    mergedFromIds: mergedFromIdsStr
                }
            });
        } else {
            await prisma.order.update({
                where: { id: mainOrder.id },
                data: { mergedFromIds: mergedFromIdsStr }
            });
        }

        // ย้าย order โต๊ะอื่นให้เข้ามาอยู่ในโต๊ะหลัก
        await prisma.order.updateMany({
            where: {
                tableId: { in: otherTableIds },
                billStatus: BillStatus.OPEN
            },
            data: {
                tableId: mainTableId
            }
        });

        // ✅ อัปเดตโต๊ะหลัก (มีชื่อ merge เต็ม)
        await prisma.table.update({
            where: { id: mainTableId },
            data: {
                status: "ຖືກລວມ",
                mergedName: mergedName
            }
        });

        // ✅ อัปเดตโต๊ะอื่น ๆ (มี mergedName = "ຖືກລວມຢູ່")
        await prisma.table.updateMany({
            where: { id: { in: otherTableIds } },
            data: {
                status: "ຖືກລວມ",
                mergedName: "ຖືກລວມຢູ່"
            }
        });

        return res.json({
            message: "รวมโต๊ะสำเร็จ",
            mainOrderId: mainOrder.id,
            mainTableId: mainTableId,
            mergedName: mergedName
        });

    } catch (error) {
        console.error("Error merging tables:", error);
        return res.status(500).json({ message: "Server Error", error: error.message });
    }
};


exports.getIncomeExpenseReport = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);

        // ดึง order ที่ชำระเงินแล้วในเดือนนี้
        const paidOrders = await prisma.order.findMany({
            where: {
                billStatus: 'PAID',
                updatedAt: {
                    gte: startOfMonth,
                    lte: endOfMonth,
                },
            },
            select: { id: true },
        });

        const orderIds = paidOrders.map(o => o.id);

        if (orderIds.length === 0) {
            return res.json({
                period: {
                    from: startOfMonth.toISOString(),
                    to: endOfMonth.toISOString(),
                },
                totalDrinkIncome: 0,
                totalFoodIncome: 0,
                totalIncome: 0,
                totalExpense: 0,
                netProfit: 0,
            });
        }

        // ดึง orderDetails ที่สัมพันธ์กับ orderId เหล่านั้น
        const orderDetails = await prisma.orderDetail.findMany({
            where: {
                orderRound: {
                    orderId: { in: orderIds },
                },
            },
            select: {
                quantity: true,
                price: true,
                productUnitId: true, // แสดงว่าเป็นเครื่องดื่ม
                foodId: true,         // แสดงว่าเป็นอาหาร
            },
        });

        // คำนวณยอดขายแยกตามประเภท
        let totalDrinkIncome = 0;
        let totalFoodIncome = 0;

        orderDetails.forEach(detail => {
            const income = detail.quantity * detail.price;
            if (detail.productUnitId) {
                totalDrinkIncome += income;
            } else if (detail.foodId) {
                totalFoodIncome += income;
            }
        });

        const totalIncome = totalDrinkIncome + totalFoodIncome;

        // รวมรายจ่ายจากใบรับสินค้าที่ status = completed
        const totalExpenseResult = await prisma.importReceipt.aggregate({
            _sum: { totalPrice: true },
            where: {
                status: "completed",
                importDate: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            }
        });
        const totalExpense = totalExpenseResult._sum.totalPrice || 0;

        res.json({
            period: {
                from: startOfMonth.toISOString(),
                to: endOfMonth.toISOString(),
            },
            totalDrinkIncome,
            totalFoodIncome,
            totalIncome,
            totalExpense,
            netProfit: totalIncome - totalExpense,
        });

    } catch (error) {
        console.error("Error generating income/expense report:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

