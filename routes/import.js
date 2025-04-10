const express = require('express');
const cors = require('cors');
const { confirmPurchaseOrder, getImportDetail, getAllImportReceipts } = require('../controller/import');

const router = express.Router();
router.use(cors());

// Define order routes
router.post('/confirmImport/:id', confirmPurchaseOrder);
router.get('/importDetail/:id', getImportDetail);
router.get('/getImport', getAllImportReceipts);

module.exports = router; 