const express = require('express');
const cors = require('cors');
// ตรวจสอบว่า import ฟังก์ชันมาครบและถูกต้อง
const {
    addOrderToTable,
    getAllOrders,
    getOrderById,
    deleteOrder,
    updateRoundKitchenStatus, // <-- มีฟังก์ชันนี้แล้ว
    checkoutOrder, // <-- อย่าลืม import ถ้ามี
    cancelOrder    // <-- อย่าลืม import ถ้ามี
} = require('../controller/order');

const router = express.Router();
router.use(cors());

// --- Order Routes ---

// สร้าง Order / เพิ่มรายการเข้าโต๊ะ
router.post('/createOrder', addOrderToTable); // <-- แนะนำให้ใช้ /orders (Plural)

// ดึง Order ทั้งหมด
router.get('/getOrders', getAllOrders);

// ดึง Order ตาม ID
router.get('/orders/:id', getOrderById);

// ลบ Order (ระวังการใช้งาน)
router.delete('/orders/:id', deleteOrder);

// --- *** แก้ไข/เพิ่ม Route สำหรับอัปเดตสถานะ Round *** ---
router.put('/orders/rounds/:roundId', updateRoundKitchenStatus);

// (ถ้ามี) เพิ่ม Route สำหรับ Checkout และ Cancel
router.post('/orders/checkout/:orderId', checkoutOrder);
// router.post('/orders/:orderId/cancel', cancelOrder);


module.exports = router;