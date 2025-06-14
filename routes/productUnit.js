const express = require('express')
const cors = require('cors')
const { createUnit, getAllUnits, getUnitById, deleteUnit, updateUnit } = require('../controller/unit')
const { createProductUnit, getAllProductUnits, deleteProductUnit, updateProductUnit } = require('../controller/productUnit')
const router = express.Router()

router.use(cors())

router.post('/createProductUnit', createProductUnit)
router.get('/getAllProductUnits', getAllProductUnits)
router.delete('/deleteProductUnit/:id', deleteProductUnit)
router.put('/updateProductUnit/:id', updateProductUnit)

module.exports = router