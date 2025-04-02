const express = require('express')
const cors = require('cors')
const { createDrink, getDrink, deleteDrink } = require('../controller/drink')
const upload = require('../config/multerConfig')

const router = express.Router()
router.use(cors())

router.post('/createDrink', upload.single('image'), createDrink)
router.get('/getDrink', getDrink)
router.delete('/delDrink/:id', deleteDrink)
router.delete('/delDrink/:id', upload.single('image'), deleteDrink)

module.exports = router