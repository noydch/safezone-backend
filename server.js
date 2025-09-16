const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
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

// ✅ สร้าง HTTP Server และ Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ทำให้ socket ใช้ได้ทุก controller
global.io = io;

// เริ่มฟัง socket
io.on('connection', (socket) => {
  console.log('🔌 New client connected: ' + socket.id);

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected: ' + socket.id);
  });
});

// ✅ ใช้ 0.0.0.0 เพื่อให้ Render เข้าถึงได้
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
