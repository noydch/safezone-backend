const express = require('express');
const cors = require('cors');
const { createOrder, getAllOrders, getOrderById, deleteOrder } = require('../controller/order');

const router = express.Router();
router.use(cors());

// Define order routes
router.post('/createOrder', createOrder);
router.get('/getOrders', getAllOrders);
router.get('/getOrder/:id', getOrderById);
router.delete('/deleteOrder/:id', deleteOrder);

module.exports = router; 