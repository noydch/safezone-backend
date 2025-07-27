const prisma = require("../config/prisma");
const bcrypt = require('bcryptjs')


exports.getEmployee = async (req, res) => {
    try {
        const { role } = req.query;

        // ถ้า role ไม่มีหรือเป็นค่าว่าง ให้ไม่ filter role
        const employees = await prisma.employee.findMany({
            where: role ? { role } : {},
        });

        res.json(employees);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
    }
};


exports.delEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const employee = await prisma.employee.delete({ where: { id: id } })
        res.send(employee)
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Server Error"
        })
    }
}

exports.updateEmployee = async (req, res) => {
    try {
        const { password, ...otherFields } = req.body;

        let updateData = { ...otherFields };

        if (password && password.trim() !== '') {
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            updateData.password = hashedPassword;
        }

        const updatedEmployee = await prisma.employee.update({
            where: { id: parseInt(req.params.id) },
            data: updateData,
        });

        res.json(updatedEmployee);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};