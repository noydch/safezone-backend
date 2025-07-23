const prisma = require("../config/prisma");

// ✅ Create Table
exports.insertTable = async (req, res) => {
    try {
        const { table_number, seat } = req.body;

        const table = await prisma.table.create({
            data: {
                table_number: Number(table_number),
                status: 'ວ່າງ',
                seat: Number(seat)
            }
        });

        res.status(201).json({
            message: "Insert Table is successful",
            table
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
};


// ✅ Delete Table
exports.delTable = async (req, res) => {
    try {
        const { id } = req.params;

        const table = await prisma.table.delete({
            where: {
                id: parseInt(id)
            }
        });

        res.json({
            message: 'Delete table is successful!',
            table
        });
    } catch (error) {
        console.error(error);
        if (error.code === 'P2003') {
            return res.status(400).json({
                message: 'Cannot delete table because it is referenced by other records'
            });
        }
        res.status(500).json({ message: 'Server Error' });
    }
};

// ✅ Update Table
exports.updateTable = async (req, res) => {
    try {
        const { table_number, status, seat } = req.body;
        const { id } = req.params;

        const table = await prisma.table.update({
            where: { id: parseInt(id) },
            data: {
                table_number: Number(table_number),
                status,
                seat: Number(seat)
            }
        });

        res.json({
            message: "Update is successful!",
            table
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
};

// ✅ Get All Tables
exports.getTable = async (req, res) => {
    try {
        const tables = await prisma.table.findMany();
        res.json(tables);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
};

// ✅ Get TableGroups with Tables
exports.getTableGroupsWithTables = async (req, res) => {
    try {
        const groups = await prisma.tableGroup.findMany({
            include: {
                tables: true
            }
        });

        res.json(groups);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "ເກີດຂໍ້ຜິດພາດໃນການດຶງຂໍ້ມູນກຸ່ມໂຕະ" });
    }
};
