const express = require('express')
const cors = require('cors')
const { getDrinkReport } = require('../controller/food')
const { getOrderReport, getIncomeExpenseReport } = require('../controller/order')
const router = express.Router()

router.get('/reportFoodDrink', getDrinkReport)
router.get('/reportOrder', getOrderReport)
router.get('/reportIncomeExpense', getIncomeExpenseReport)

router.use(cors())


module.exports = router