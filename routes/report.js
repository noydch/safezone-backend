const express = require('express')
const cors = require('cors')
const { getFoodAndDrinkReport } = require('../controller/food')
const { getOrderReport, getIncomeExpenseReport } = require('../controller/order')
const router = express.Router()

router.get('/reportFoodDrink', getFoodAndDrinkReport)
router.get('/reportOrder', getOrderReport)
router.get('/reportIncomeExpense', getIncomeExpenseReport)

router.use(cors())


module.exports = router