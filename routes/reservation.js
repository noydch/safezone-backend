const express = require('express')
const cors = require('cors')
const { reservation } = require('../controller/reservation')

const router = express.Router()
router.use(cors())

router.post('/reservation', reservation)

module.exports = router