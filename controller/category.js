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
                id: Number(req.params.id)
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

exports.getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await prisma.category.findUnique({
            where: { id: Number(id) },
            include: {
                foods: true,
                drinks: true
            }
        });


        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.json(category);
    } catch (error) {
        console.error("Error fetching category by id:", error);
        res.status(500).json({ message: "Server error" });
    }
};
