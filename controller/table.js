const prisma = require("../config/prisma");

exports.insertTable = async (req, res) => {
    try {
        const { table_number, status, seat } = req.body
        console.log(req.body);
        const table = await prisma.table.create({
            data: {
                table_number: Number(table_number),
                status: 'ວ່າງ',
                seat: Number(seat)
            }
        })
        res.send("Insert Table is seccess")
    } catch (error) {
        console.log(error);
    }
}

exports.delTable = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(id);
        const table = await prisma.table.delete({
            where: {
                id: parseInt(id)
            }
        })
        res.json({
            message: 'Delete table is successful!!',
            table
        })
    } catch (error) {
        console.log(error);
    }
}

exports.updateTable = async (req, res) => {
    try {
        const { table_number, status, seat } = req.body;
        const { id } = req.params;
        const table = await prisma.table.update({
            where: {
                id: parseInt(id)
            },
            data: {
                table_number: Number(table_number),
                status: status,
                seat: Number(seat)
            }
        })
        res.json({
            message: "Update is successful!!!",
            table
        })
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Server Error"
        })
    }
}

exports.getTable = async (req, res) => {
    try {
        const table = await prisma.table.findMany()
        res.send(table)
    } catch (error) {
        console.log(error);
    }
}