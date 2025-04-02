const express = require('express')
const app = express()
const morgan = require('morgan')
const cors = require('cors')
require('dotenv').config();


const { readdirSync } = require('fs')

// middleware
app.use(morgan('dev'))
app.use(express.json({ limit: '30mb' }))
app.use(cors())

// read dir router
readdirSync('./routes').map((routerFolders) => app.use('/api',
    require('./routes/' + routerFolders)
))


app.listen(5050, () => console.log("Server is Running on Port 5050"))