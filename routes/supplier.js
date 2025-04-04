const express = require('express');
const cors = require('cors');
const {
    createSupplier,
    getAllSuppliers,
    getSupplierById,
    updateSupplier,
    deleteSupplier
} = require('../controller/supplier');

const router = express.Router();
router.use(cors());

// Define supplier routes
router.post('/createSupplier', createSupplier);
router.get('/getSuppliers', getAllSuppliers);
router.get('/getSupplier/:id', getSupplierById);
router.put('/updateSupplier/:id', updateSupplier);
router.delete('/deleteSupplier/:id', deleteSupplier);

module.exports = router; 