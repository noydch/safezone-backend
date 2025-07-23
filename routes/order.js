const express = require('express');
const cors = require('cors');
const { addOrderToTable, getAllOrders, getOrderById, deleteOrder, updateRoundKitchenStatus, cancelOrder, moveTable, mergeTable, cancelOrderDetail, checkoutOrder, getTableGroupsWithTables } = require('../controller/order');

const router = express.Router();
router.use(cors());

// --- Order Routes ---

// สร้าง Order / เพิ่มรายการเข้าโต๊ะ
router.post('/createOrder', addOrderToTable);

// ดึง Order ทั้งหมด
router.get('/getOrders', getAllOrders);

// ดึง Order ตาม ID
router.get('/orders/:id', getOrderById);

// ลบ Order
router.delete('/orders/:id', deleteOrder);

// อัปเดตสถานะ Round ครัว
router.put('/orders/rounds/:roundId', updateRoundKitchenStatus);

// Checkout Order
router.post('/orders/checkout/:orderId', checkoutOrder);

// Cancel Order
router.post('/orders/:orderId/cancel', cancelOrder);
router.post('/orders/cancelFoodItem/:id', cancelOrderDetail);

// --- เพิ่ม Route สำหรับย้ายโต๊ะ ---
router.post('/orders/moveTable', moveTable);

// --- เพิ่ม Route สำหรับรวมโต๊ะ ---
router.post('/orders/mergeTables', mergeTable);


module.exports = router;
