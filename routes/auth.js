const express = require('express')
const cors = require('cors')
const { login, register, currentUser } = require('../controller/auth')
const { authCheck, adminCheck, roleCheck } = require('../middleware/authCheck')

const router = express.Router()

router.use(cors())

router.post('/login', login)
router.post('/register', register)

module.exports = router