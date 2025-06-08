const express = require('express')
const app = express()
const morgan = require('morgan')
const cors = require('cors')
require('dotenv').config();

const { readdirSync } = require('fs')

// CORS configuration
app.use(cors({
    origin: [
        'http://localhost:5173',      // สำหรับ development (Frontend 1)
        'http://localhost:5174',      // สำหรับ development (Frontend 2 - ທີ່ເພີ່ມໃໝ່)
        'https://mysafezone.netlify.app',  // สำหรับ production
        'https://mysafezone-mb.netlify.app'  // สำหรับ production
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// middleware
app.use(morgan('dev'))
app.use(express.json({ limit: '30mb' }))

// read dir router
readdirSync('./routes').map((routerFolders) => app.use('/api',
    require('./routes/' + routerFolders)
))

app.listen(5050, () => console.log("Server is Running on Port 5050"))