const express = require('express')
const cors = require('cors')
const { insertCart, getCart, updateCart, delCartItem } = require('../controller/userCart')
const { authCheck } = require('../middleware/authCheck')
const router = express.Router()

router.use(cors())

router.post('/addCart', authCheck, insertCart)
router.get('/getCart', authCheck, getCart)
router.put('/updateCart', updateCart)
router.delete("/delCartItem/:cartItemId", delCartItem);
module.exports = router