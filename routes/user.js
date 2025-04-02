const express = require('express')
const cors = require('cors')
const upload = require('../config/multerConfig')
// const { createCart } = require('../controller/cart')
const { getEmployee, updateEmployee } = require('../controller/user')

const router = express.Router()
router.use(cors())

router.get('/getEmployee', getEmployee)
router.put('/updateEmployee/:id', updateEmployee)

module.exports = router