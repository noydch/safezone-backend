const express = require('express');
const app = express();
const http = require('http'); // เพิ่ม http server
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const { readdirSync } = require('fs');

const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: [
        'http://localhost:5173',
        // 'http://localhost:5174',
        // 'https://mysafezone.netlify.app',
        'https://saysamone1.wasmer.app/'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '30mb' }));

readdirSync('./routes').map((r) =>
    app.use('/api', require('./routes/' + r))
);

// Health check for Render
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

// ✅ ทำให้ socket ใช้ได้ทุก controller ผ่าน global
global.io = io;

// เริ่มฟัง socket
io.on('connection', (socket) => {
    console.log('🔌 New client connected: ' + socket.id);

    socket.on('disconnect', () => {
        console.log('❌ Client disconnected: ' + socket.id);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running on port ${PORT}`);
});
