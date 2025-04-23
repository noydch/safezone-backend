const express = require('express');
const cors = require('cors');
const {
    createPurchaseOrder,
    getAllPurchaseOrders,
    getPurchaseOrderById,
    updatePurchaseOrderStatus,
    deletePurchaseOrder
} = require('../controller/purchaseOrder');

const router = express.Router();

// Define Purchase Order routes
router.post('/createPurchaseOrder', createPurchaseOrder);
router.get('/getPurchaseOrders', getAllPurchaseOrders);
router.get('/getPurchaseOrder/:id', getPurchaseOrderById);
router.put('/updatePurchaseOrderStatus/:id', updatePurchaseOrderStatus); // Use PUT for updating status
router.delete('/deletePurchaseOrder/:id', deletePurchaseOrder);

module.exports = router; 