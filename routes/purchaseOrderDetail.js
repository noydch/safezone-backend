const express = require('express');
const cors = require('cors');
const {
    getAllDetailsByPurchaseOrderId,
    getPurchaseOrderDetailById,
    updatePurchaseOrderDetail,
    deletePurchaseOrderDetail
} = require('../controller/purchaseOrderDetail');

const router = express.Router();
router.use(cors());

router.get('/getDetailsByOrderId/:purchaseOrderId', getAllDetailsByPurchaseOrderId);
router.get('/getPurchaseOrderDetail/:id', getPurchaseOrderDetailById);
router.put('/updatePurchaseOrderDetail/:id', updatePurchaseOrderDetail);
router.delete('/deletePurchaseOrderDetail/:id', deletePurchaseOrderDetail);

module.exports = router;