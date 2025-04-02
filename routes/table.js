
const express = require('express')
const cors = require('cors')
const { insertTable, delTable, getTable, updateTable } = require('../controller/table')

const router = express.Router()
router.use(cors())

router.post('/insertTable', insertTable)
router.delete('/delTable/:id', delTable)
router.put('/updateTable/:id', updateTable)
router.get('/getTable', getTable)

module.exports = router