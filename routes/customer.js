const express = require('express');
const cors = require('cors');
const {
    createCustomer,
    getAllCustomers,
    getCustomerById,
    updateCustomer,
    deleteCustomer
} = require('../controller/customer');

const router = express.Router();
router.use(cors());

// Define customer routes
router.post('/createCustomer', createCustomer);
router.get('/getCustomers', getAllCustomers);
router.get('/getCustomer/:id', getCustomerById);
router.put('/updateCustomer/:id', updateCustomer);
router.delete('/deleteCustomer/:id', deleteCustomer);

module.exports = router; 