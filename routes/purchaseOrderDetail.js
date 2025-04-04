const express = require('express');
const cors = require('cors');
const {
    getAllPurchaseOrderDetails,
    getPurchaseOrderDetailById,
    updatePurchaseOrderDetail,
    deletePurchaseOrderDetail,
    getAllPurchaseOrderDetailsByPurchaseOrderId
} = require('../controller/purchaseOrderDetail');

const router = express.Router();
router.use(cors());

// Define Purchase Order Detail routes
router.get('/getPurchaseOrderDetails', getAllPurchaseOrderDetails); // Get all details (optional filter by poId query param)
router.get('/getDetailsByOrderId/:purchaseOrderId', getAllPurchaseOrderDetailsByPurchaseOrderId); // Get all details for a specific PO ID (path param)
router.get('/getPurchaseOrderDetail/:id', getPurchaseOrderDetailById); // Get a single detail by its own ID
router.put('/updatePurchaseOrderDetail/:id', updatePurchaseOrderDetail); // Update a specific detail
router.delete('/deletePurchaseOrderDetail/:id', deletePurchaseOrderDetail); // Delete a specific detail

module.exports = router; 