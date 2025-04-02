const express = require('express')
const cors = require('cors')
const { createCategory, getCategory, delCategory, putCategory } = require('../controller/category')
const router = express.Router()

router.use(cors())

router.post('/category', createCategory)
router.get('/getCategory', getCategory)
router.delete('/delCategory/:id', delCategory)
router.put('/updateCategory/:id', putCategory)

module.exports = router