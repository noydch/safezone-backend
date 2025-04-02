const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const dayjs = require('dayjs');
const { DateTime } = require('luxon');

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body
        // console.log(email, password);

        // Check email
        const employee = await prisma.employee.findFirst({
            where: {
                email: email
            }
        })
        console.log(employee);
        if (!employee) {
            return res.status(400).json({
                message: "User not found"
            })
        }


        // Check password
        const isMatchPw = await bcrypt.compare(password, employee.password)
        if (!isMatchPw) {
            return res.status(400).json({
                message: "Password Invalided!!!"
            })
        }

        // Create Payload
        const payload = {
            id: employee.id,
            email: employee.email,
            role: employee.role
        }

        // Generate token
        jwt.sign(payload, process.env.SECRET, {
            expiresIn: '1d'
        }, (err, token) => {
            if (err) {
                return res.status(500).json({
                    message: "Error Generate TOKEN"
                })
            }
            res.json({ payload, token })
        }
        )
    } catch (error) {
        console.log(error);
    }
}

exports.register = async (req, res) => {
    try {
        const { fname, lname, phone, dob, email, password } = req.body;
        // console.log(email, "\n", password);

        if (!email) {
            return res.status(400).json({
                message: "Email is Rquired !!!"
            })
        }
        if (!password) {
            return res.status(400).json({
                message: "Password is Required !!!"
            })
        }

        // check in db have or no
        const user = await prisma.employee.findFirst({
            where: {
                email
            }
        })
        if (user) {
            return res.status(400).json({
                message: "Email already Exits !!!"
            })
        }


        // hash password
        const hashPassword = await bcrypt.hash(password, 10)
        console.log(hashPassword);


        // register
        await prisma.employee.create({
            data: {
                fname,
                lname,
                gender: 'Male',
                phone,
                dob: DateTime.fromISO(dob, { zone: "utc" }).startOf("day").toJSDate(), //ແປງເປັນ YYYY-MM-DD
                email,
                password: hashPassword
            }
        })

        console.log(dayjs(user?.dob).format('YYYY-MM-DD'))
        res.send("Register Successfully!!!")
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error" })
    }
}

exports.currentUser = async (req, res) => {
    try {
        const user = await prisma.employee.findFirst({
            where: {
                email: req.user.email
            },
            select: {
                id: true,
                email: true,
                role: true
            }
        })
        res.json({ user })
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error" })
    }
}