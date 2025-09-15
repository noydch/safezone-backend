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

        // Ensure itemType is present
        const itemType = item.itemType;
        if (!itemType) {
            throw new Error(`ItemType is missing for item: ${JSON.stringify(item)}`);
        }

        let validatedItem;
        if (item.foodId) {
            const food = foodMap.get(parseInt(item.foodId, 10));
            if (!food) throw new Error(`Food with ID ${item.foodId} not found.`);
            validatedItem = { foodId: food.id, quantity, price: food.price, itemType: itemType }; // Include itemType
        } else if (item.productUnitId) {
            const productUnit = productUnitMap.get(parseInt(item.productUnitId, 10));
            if (!productUnit) throw new Error(`ProductUnit with ID ${item.productUnitId} not found.`);
            validatedItem = { productUnitId: productUnit.id, quantity, price: productUnit.price, itemType: itemType }; // Include itemType
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
        const { empId, tableIds, orderDetails } = req.body;

        if (!empId || !Array.isArray(tableIds) || tableIds.length === 0 || !Array.isArray(orderDetails) || orderDetails.length === 0) {
            return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
        }

        // กรองรายการที่ถูกต้อง
        const validDetails = orderDetails.filter(item => item && (item.foodId || item.productUnitId));
        if (validDetails.length === 0) {
            return res.status(400).json({ message: "ไม่มีรายการอาหารหรือเครื่องดื่มที่ถูกต้อง" });
        }

        // เตรียมข้อมูล + ราคา
        const preparedDetails = await Promise.all(validDetails.map(async (item) => {
            if (item.foodId) {
                const food = await prisma.food.findUnique({ where: { id: item.foodId } });
                if (!food) throw new Error(`ไม่พบอาหาร id ${item.foodId}`);
                return { ...item, price: food.price };
            } else if (item.productUnitId) {
                const pu = await prisma.productUnit.findUnique({ where: { id: item.productUnitId } });
                if (!pu) throw new Error(`ไม่พบหน่วยสินค้า id ${item.productUnitId}`);
                return { ...item, price: pu.price };
            }
            return item;
        }));

        const totalPrice = preparedDetails.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        // โต๊ะหลัก
        const mainTableId = parseInt(tableIds[0]);
        const mergedFromIdsStr = tableIds.join(' + ');

        // ตรวจสอบว่าโต๊ะหลักมีอยู่จริง
        const mainTable = await prisma.table.findUnique({ where: { id: mainTableId } });
        if (!mainTable) {
            return res.status(404).json({ message: "ไม่พบโต๊ะหลัก" });
        }

        // หาว่ามี order ที่เปิดอยู่หรือยัง
        let order = await prisma.order.findFirst({
            where: {
                tableId: mainTableId,
                billStatus: BillStatus.OPEN
            }
        });

        if (!order) {
            order = await prisma.order.create({
                data: {
                    empId: parseInt(empId),
                    tableId: mainTableId,
                    total_price: totalPrice,
                    billStatus: BillStatus.OPEN,
                    mergedFromIds: mergedFromIdsStr
                }
            });
        } else {
            order = await prisma.order.update({
                where: { id: order.id },
                data: {
                    total_price: { increment: totalPrice },
                    empId: parseInt(empId),
                    mergedFromIds: mergedFromIdsStr
                }
            });
        }

        // สร้างรอบใหม่
        const lastRound = await prisma.orderRound.findFirst({
            where: { orderId: order.id },
            orderBy: { roundNumber: 'desc' }
        });

        const roundNumber = lastRound ? lastRound.roundNumber + 1 : 1;

        const orderRound = await prisma.orderRound.create({
            data: {
                orderId: order.id,
                roundNumber
            }
        });

        // เพิ่ม orderDetails
        for (const item of preparedDetails) {
            await prisma.orderDetail.create({
                data: {
                    orderRoundId: orderRound.id,
                    foodId: item.foodId || null,
                    productUnitId: item.productUnitId || null,
                    quantity: item.quantity,
                    price: item.price,
                    itemType: item.itemType // ✅ เพิ่ม itemType ตรงนี้
                }
            });
        }


        // อัปเดตโต๊ะทั้งหมดที่ถูกรวม
        await Promise.all(tableIds.map(id =>
            prisma.table.update({
                where: { id: parseInt(id) },
                data: {
                    status: "ກຳລັງໃຊ້ງານ",
                    mergedFromIds: mergedFromIdsStr
                }
            })
        ));

        // ส่งข้อมูล order เต็มกลับ
        const fullOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: {
                employee: true,
                table: true,
                orderRounds: {
                    orderBy: { roundNumber: 'asc' },
                    include: {
                        orderDetails: {
                            include: {
                                food: true,
                                productUnit: {
                                    include: { drink: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        return res.status(201).json({ message: "เพิ่มรายการออเดอร์สำเร็จ", order: fullOrder });
    } catch (error) {
        console.error("addOrderToTable error:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ", error: error.message });
    }
};


// =================================================================
// 2. ชำระเงิน / ปิดบิล (นำการตัดสต็อกออก)
// =================================================================
exports.checkoutOrder = async (req, res) => {
    const { orderId } = req.params;
    const { payment_method } = req.body; // 'CASH' หรือ 'TRANSFER'

    try {
        const order = await prisma.order.findUnique({
            where: { id: parseInt(orderId) },
            include: { table: true },
        });

        if (!order) throw new Error("ไม่พบออเดอร์");

        const mergedFromIds = order.mergedFromIds
            ? order.mergedFromIds
                .split(' + ')
                .map(id => parseInt(id.trim()))
                .filter(id => !isNaN(id))
            : [];

        await prisma.$transaction(async (tx) => {
            // ✅ เคลียร์สถานะโต๊ะที่ถูกรวม
            if (mergedFromIds.length > 0) {
                await prisma.table.updateMany({
                    where: { id: { in: mergedFromIds } },
                    data: {
                        status: "ວ່າງ",
                        mergedFromIds: null,
                        groupId: null
                    },
                });
            }

            // ✅ เคลียร์สถานะโต๊ะหลัก
            await prisma.table.update({
                where: { id: order.tableId },
                data: {
                    status: "ວ່າງ",
                    mergedFromIds: null,
                    groupId: null
                },
            });

            // ✅ ลบ TableGroup ถ้ามี
            if (order.table.groupId) {
                await prisma.tableGroup.delete({
                    where: { id: order.table.groupId },
                });
            }

            // ✅ อัปเดตสถานะบิล
            await prisma.order.update({
                where: { id: order.id },
                data: {
                    billStatus: 'PAID',
                    paidAt: new Date(),
                    payment_method,
                    // mergedFromIds: null,
                },
            });
        }, {
            timeout: 30000,
            maxWait: 10000,
        });

        res.json({
            message: 'ການຊຳລະເງິນສຳເລັດແລ້ວ!!!',
        });
    } catch (error) {
        console.error("Checkout Error:", error);
        res.status(500).json({ error: error.message });
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
            const orderToCancel = await prisma.order.findUnique({
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
                    prisma.drink.update({
                        where: { id: drinkId },
                        data: { qty: { increment: qty } }
                    })
                );
                await Promise.all(stockUpdates);
            }

            return prisma.order.update({
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
// =================================================================exports.getOrderById = async (req, res) => {
exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const orderId = parseInt(id, 10);

        if (isNaN(orderId)) {
            return res.status(400).json({ message: "ID ບໍ່ຖືກຕ້ອງ" });
        }

        const order = await prisma.order.findUnique({
            where: {
                id: orderId,
            },
            include: {
                employee: true,
                table: {
                    include: {
                        group: { // ✅ ใช้ group แทน tableGroup
                            include: {
                                tables: true, // ✅ ดึงโต๊ะที่ถูกรวมใน group เดียวกัน
                            }
                        }
                    }
                },
                orderRounds: {
                    orderBy: { roundNumber: 'asc' },
                    include: {
                        orderDetails: {
                            include: {
                                food: true,
                                productUnit: {
                                    include: {
                                        drink: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!order) {
            return res.status(404).json({ message: "ບໍ່ພົບອໍເດີ" });
        }

        return res.json(order);
    } catch (error) {
        console.error("Error fetching order by ID:", error);
        return res.status(500).json({ message: "ເກີດຂໍ້ຜິດພາດການດຶງຂໍ້ມູນອໍເດີ" });
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

        const [fromTable, toTable] = await Promise.all([
            prisma.table.findUnique({ where: { id: fromTableId } }),
            prisma.table.findUnique({ where: { id: toTableId } }),
        ]);

        if (!fromTable || !toTable) {
            return res.status(404).json({ message: "ไม่พบโต๊ะต้นทางหรือปลายทาง" });
        }

        if (toTable.status !== "ວ່າງ") {
            return res.status(400).json({ message: "โต๊ะปลายทางไม่ว่าง" });
        }

        const openOrder = await prisma.order.findFirst({
            where: {
                tableId: fromTableId,
                billStatus: BillStatus.OPEN
            },
            include: {
                table: true
            }
        });

        if (!openOrder) {
            return res.status(404).json({ message: "ไม่พบออเดอร์ที่เปิดอยู่ในโต๊ะต้นทาง" });
        }

        await prisma.$transaction(async (tx) => {
            // ย้าย order ไปยังโต๊ะใหม่
            await prisma.order.update({
                where: { id: openOrder.id },
                data: {
                    tableId: toTableId,
                    // ถ้าต้องการ clear mergedFromIds หรือ update ด้วย
                    mergedFromIds: null
                }
            });

            // อัปเดตสถานะโต๊ะเก่าให้เป็น "ວ່າງ"
            await prisma.table.update({
                where: { id: fromTableId },
                data: {
                    status: "ວ່າງ",
                    mergedFromIds: null,
                    groupId: null
                }
            });

            // อัปเดตสถานะโต๊ะใหม่ให้เป็น "ກຳລັງໃຊ້ງານ"
            await prisma.table.update({
                where: { id: toTableId },
                data: {
                    status: "ກຳລັງໃຊ້ງານ",
                    mergedFromIds: null,
                    groupId: null
                }
            });
        });

        return res.json({ message: "ย้ายโต๊ะสำเร็จ" });
    } catch (error) {
        console.error("Error moving table:", error);
        return res.status(500).json({ message: "Server Error moving table", error: error.message });
    }
};

// =================================================================
// 11. รวมโต๊ะ (mergeTable)
// =================================================================
exports.mergeTable = async (req, res) => {
    try {
        const { tableIds } = req.body; // รับเป็น array เช่น [34, 35, 36]

        if (!Array.isArray(tableIds) || tableIds.length < 2) {
            return res.status(400).json({ message: "ต้องเลือกโต๊ะ 2 ตัวขึ้นไปในการรวมโต๊ะ" });
        }

        // ตรวจสอบโต๊ะที่ส่งมาว่ามีอยู่จริงไหม
        const tables = await prisma.table.findMany({
            where: {
                id: { in: tableIds }
            }
        });

        if (tables.length !== tableIds.length) {
            return res.status(404).json({ message: "โต๊ะบางตัวไม่พบในระบบ" });
        }

        // สร้าง TableGroup ใหม่
        const newGroup = await prisma.tableGroup.create({
            data: {}
        });

        // อัปเดตโต๊ะทั้งหมด ให้ชี้ groupId เป็น TableGroup ใหม่ และสถานะเป็น "ຖືກລວມ"
        await Promise.all(
            tableIds.map(tableId =>
                prisma.table.update({
                    where: { id: tableId },
                    data: {
                        groupId: newGroup.id,
                        status: "ຖືກລວມ",
                    },
                })
            )
        );

        return res.json({ message: "รวมโต๊ะสำเร็จ", groupId: newGroup.id });
    } catch (error) {
        console.error("mergeTable error:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในการรวมโต๊ะ" });
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


// ยกเลิกเฉพาะรายการอาหาร

exports.cancelOrderDetail = async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ message: "Missing order detail id parameter" });
    }

    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        return res.status(400).json({ message: "Invalid order detail id parameter" });
    }

    try {
        const orderDetail = await prisma.orderDetail.findUnique({
            where: { id: parsedId },
            include: {
                orderRound: {
                    select: {
                        orderId: true,
                    },
                },
                food: { // <--- ADD THIS
                    select: {
                        name: true, // <--- Select the food name
                    },
                },
            },
        });

        if (!orderDetail) {
            return res.status(404).json({ message: 'ບໍ່ພົບລາຍການອາຫານນີ້' });
        }

        if (orderDetail.itemType !== 'FOOD') {
            return res.status(400).json({ message: 'ບໍ່ສາມາດຍົກເລີກລາຍການທີ່ບໍ່ແມ່ນອາຫານໄດ້!!!' });
        }

        const cancelled = await prisma.orderDetail.update({
            where: { id: parsedId },
            data: {
                status: 'CANCELLED',
                cancelReason: 'ວັດຖุดິບໝົດ!',
            },
        });

        // Determine the item name based on its type
        let itemName = '';
        if (orderDetail.itemType === 'FOOD' && orderDetail.food) {
            itemName = orderDetail.food.name;
        } else if (orderDetail.itemType === 'DRINK' && orderDetail.productUnit) {
            itemName = orderDetail.productUnit.name;
        }


        // ✅ แจ้งเตือนแบบ real-time ไปยังพนักงานทุกคน
        global.io.emit('orderItemCancelled', {
            message: 'รายการอาหารถูกยกเลิก',
            orderDetailId: parsedId,
            orderId: orderDetail.orderRound.orderId,
            itemName: itemName, // <--- ADD THIS LINE
            reason: 'ວັດຖຸດິບໝົດ!',
        });

        res.json({
            message: 'ຍົກເລີກການອາຫານສຳເລັດ!!!',
            cancelled,
        });

    } catch (error) {
        console.error('ຍົກເລີກລາຍการอาหารล้มเหลว:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการยกเลิกอาหาร!' });
    }
};