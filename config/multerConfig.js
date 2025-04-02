const multer = require("multer");

// ใช้ memoryStorage เพื่อเก็บไฟล์ใน RAM ชั่วคราว
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // จำกัดขนาดไฟล์ 5MB
});

module.exports = upload;
