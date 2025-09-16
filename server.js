const express = require('express');
const app = express();
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();
const { readdirSync } = require('fs');

// ⚡ Render จะส่ง PORT ของมันเองมา
const PORT = process.env.PORT || 3000;

// ✅ ปรับ CORS ให้ยืดหยุ่น
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://saysamone1.wasmer.app',
    'https://mysafezone.netlify.app',
    '*' // 👉 เปิดกว้างไว้ชั่วคราวตอน debug
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '30mb' }));

// โหลด routes อัตโนมัติ
readdirSync('./routes').map((r) =>
  app.use('/api', require('./routes/' + r))
);

// ✅ Health check (Render ใช้ตรวจว่า server ติดหรือยัง)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ✅ ใช้ 0.0.0.0 เพื่อให้ Render เข้าถึงได้
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
