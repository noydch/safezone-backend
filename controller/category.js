const prisma = require("../config/prisma");


exports.createCategory = async (req, res) => {
    try {
        const { name } = req.body
        console.log(name);
        const category = await prisma.category.create({
            data: {
                name
            }
        })
        res.json({
            message: "Category created successfully",
            category
        })
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" })
    }
}

exports.getCategory = async (req, res) => {
    try {
        const category = await prisma.category.findMany()
        res.send(category)
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" })
    }
}

exports.delCategory = async (req, res) => {
    try {
        const { id } = req.params
        const category = await prisma.category.delete({
            where: {
                id: Number(id)
            }
        })
        res.json({
            message: "Category deleted successfully",
            category
        })
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" })
    }
}

exports.putCategory = async (req, res) => {
    try {
        const { name } = req.body
        // console.log(req.body);
        const category = await prisma.category.update({
            where: {
                cid: Number(req.params.id)
            },
            data: {
                name: name
            }
        })
        res.json({
            message: "Category Updated !!!",
            category
        })
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" })
    }
}