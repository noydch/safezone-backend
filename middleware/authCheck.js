const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

// exports.authCheck = async (req, res, next) => {
//     try {
//         const headerToken = req.headers.authorization;

//         if (!headerToken || !headerToken.startsWith("Bearer ")) {
//             return res.status(401).json({ message: "No Token, Authorization Denied" });
//         }

//         const token = headerToken.split(" ")[1];
//         const decoded = jwt.verify(token, process.env.SECRET); // Decode token
//         ฟ
//         // ตรวจสอบว่าผู้ใช้มีอยู่ในระบบ
//         const user = await prisma.employee.findUnique({
//             where: { email: decoded.email }
//         });

//         if (!user) {
//             return res.status(401).json({ message: "User not found" });
//         }

//         req.user = { id: parseInt(user.id), email: user.email }; // เก็บข้อมูล user ใน req.user
//         next();
//     } catch (error) {
//         console.error("Auth Check Error:", error);
//         res.status(401).json({ message: "Token Invalid or Expired" });
//     }
// };

exports.authCheck = async (req, res, next) => {
    try {
        const headerToken = req.headers.authorization;

        if (!headerToken || !headerToken.startsWith("Bearer ")) {
            return res.status(401).json({ message: "No Token, Authorization Denied" });
        }

        const token = headerToken.split(" ")[1];
        const decoded = jwt.verify(token, process.env.SECRET);

        const user = await prisma.employee.findUnique({
            where: { email: decoded.email }
        });

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        req.user = {
            id: user.id,
            email: user.email,
            role: user.role
        };
        next();
    } catch (error) {
        console.error("Auth Check Error:", error);
        res.status(401).json({ message: "Token Invalid or Expired" });
    }
};

exports.roleCheck = (...allowedRoles) => {
    return (req, res, next) => {
        const { role } = req.user;

        if (!allowedRoles.includes(role)) {
            return res.status(403).json({ message: "Access Denied: Insufficient Permission" });
        }

        next();
    };
};
