const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

exports.authCheck = async (req, res, next) => {
    try {
        const headerToken = req.headers.authorization;

        if (!headerToken || !headerToken.startsWith("Bearer ")) {
            return res.status(401).json({ message: "No Token, Authorization Denied" });
        }

        const token = headerToken.split(" ")[1];
        const decoded = jwt.verify(token, process.env.SECRET); // Decode token

        // ตรวจสอบว่าผู้ใช้มีอยู่ในระบบ
        const user = await prisma.employee.findUnique({
            where: { email: decoded.email }
        });

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        req.user = { id: parseInt(user.id), email: user.email }; // เก็บข้อมูล user ใน req.user
        next();
    } catch (error) {
        console.error("Auth Check Error:", error);
        res.status(401).json({ message: "Token Invalid or Expired" });
    }
};

exports.adminCheck = async (req, res, next) => {
    try {
        const { email } = req.user;
        const adminUser = await prisma.employee.findFirst({  // เปลี่ยนให้ตรงกับ table ใน Prisma
            where: { email }
        });

        if (!adminUser || adminUser.role !== "admin") {
            return res.status(403).json({
                message: "Access Denied: Admin Only"
            });
        }

        console.log("Admin Verified:", adminUser);
        next();
    } catch (error) {
        console.error("Admin Check Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
