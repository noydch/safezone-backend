const express = require('express')
const cors = require('cors')
const { login, register, currentUser } = require('../controller/auth')
const { authCheck, adminCheck } = require('../middleware/authCheck')

const router = express.Router()

router.use(cors())

router.post('/login', login)
router.post('/register', register)
// router.post('/current-user', authCheck, currentUser)
// router.post('/current-admin', authCheck, adminCheck, currentUser)

module.exports = router