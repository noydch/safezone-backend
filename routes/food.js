const express = require('express')
const cors = require('cors')
const { createFood, getFood, deleteFood, updateFood } = require('../controller/food')
const upload = require('../config/multerConfig')

const router = express.Router()
router.use(cors())

router.post('/createFood', upload.single('image'), createFood)
router.get('/getFood', getFood)
router.delete('/delFood/:id', deleteFood)
router.delete('/updateFood/:id', upload.single('image'), updateFood)

module.exports = router