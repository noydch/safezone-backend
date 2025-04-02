const prisma = require("../config/prisma");
const bcrypt = require('bcryptjs')


exports.getEmployee = async (req, res) => {
    try {
        // await
        const employee = await prisma.employee.findMany()
        res.send(employee)
    } catch (error) {
        console.log(error);
    }
}

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
        const { id } = req.params
        const {
            email,
            password
        } = req.body;


        // hash password
        const hashPassword = await bcrypt.hash(password, 10)
        console.log(hashPassword);

        const employee = await prisma.employee.update({
            where: {
                id: parseInt(id)
            },
            data: {
                email: email,
                password: hashPassword
            }
        })


        res.json({
            message: "Update is seccessful!!!",
            employee
        })
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Server Error"
        })
    }
}