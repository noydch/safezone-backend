const express = require('express')
const cors = require('cors')
const { createUnit, getAllUnits, getUnitById, deleteUnit, updateUnit } = require('../controller/unit')
const router = express.Router()

router.use(cors())

router.post('/createUnit', createUnit)
router.get('/getAllUnits', getAllUnits)
router.get('/getUnitById/:id', getUnitById)
router.delete('/deleteUnit/:id', deleteUnit)
router.put('/updateUnit/:id', updateUnit)

module.exports = router