const prisma = require("../config/prisma");

/**
 * @desc    สร้าง ProductUnit ใหม่สำหรับเครื่องดื่ม
 * @route   POST /api/product-units
 * @body    { name: string, price: float, drinkId: int, baseItemsCount: int }
 */
exports.createProductUnit = async (req, res) => {
    try {
        const { name, price, drinkId, baseItemsCount } = req.body;

        // --- การตรวจสอบข้อมูล ---
        if (!name || !price || !drinkId || !baseItemsCount) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // ตรวจสอบว่า drinkId ที่ส่งมามีอยู่จริงในตาราง Drink
        const drinkExists = await prisma.drink.findUnique({
            where: { id: Number(drinkId) },
        });

        if (!drinkExists) {
            return res.status(404).json({ message: `Drink with ID ${drinkId} not found.` });
        }
        // --- สิ้นสุดการตรวจสอบ ---

        const productUnit = await prisma.productUnit.create({
            data: {
                name,
                price: parseFloat(price),
                drinkId: Number(drinkId),
                baseItemsCount: parseInt(baseItemsCount),
            },
        });

        res.status(201).json({
            message: "Product Unit created successfully",
            productUnit,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @desc    ดึงข้อมูล ProductUnit ทั้งหมด หรือกรองตาม drinkId
 * @route   GET /api/product-units?drinkId=1
 */
exports.getAllProductUnits = async (req, res) => {
    try {
        const { drinkId } = req.query; // รับ drinkId จาก query string

        const whereClause = {};
        if (drinkId) {
            whereClause.drinkId = Number(drinkId);
        }

        const productUnits = await prisma.productUnit.findMany({
            where: whereClause,
            include: {
                drink: { // ดึงข้อมูล drink ที่ผูกกันอยู่มาด้วย
                    select: {
                        name: true
                    }
                }
            }
        });

        res.json(productUnits);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @desc    อัปเดตข้อมูล ProductUnit
 * @route   PUT /api/product-units/:id
 */
exports.updateProductUnit = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, baseItemsCount } = req.body;
        console.log(req.body);

        // ตรวจสอบว่า ProductUnit ID นี้มีอยู่จริง
        const existingProductUnit = await prisma.productUnit.findUnique({
            where: { id: Number(id) }
        });

        if (!existingProductUnit) {
            return res.status(404).json({ message: "Product Unit not found" });
        }

        const updatedProductUnit = await prisma.productUnit.update({
            where: {
                id: Number(id),
            },
            data: {
                name,
                price: price ? parseFloat(price) : undefined,
                baseItemsCount: baseItemsCount ? parseInt(baseItemsCount) : undefined,
            },
        });

        res.json({
            message: "Product Unit updated successfully",
            productUnit: updatedProductUnit,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @desc    ลบ ProductUnit
 * @route   DELETE /api/product-units/:id
 */
exports.deleteProductUnit = async (req, res) => {
    try {
        const { id } = req.params;

        // ตรวจสอบว่า ProductUnit ID นี้มีอยู่จริง
        const existingProductUnit = await prisma.productUnit.findUnique({
            where: { id: Number(id) }
        });

        if (!existingProductUnit) {
            return res.status(404).json({ message: "Product Unit not found" });
        }

        await prisma.productUnit.delete({
            where: {
                id: Number(id),
            },
        });

        res.json({ message: `Product Unit with ID ${id} deleted successfully` });
    } catch (error) {
        console.log(error);
        if (error.code === 'P2003') { // จัดการ error กรณีลบไม่ได้เพราะถูกใช้งานอยู่
            return res.status(400).json({ message: "Cannot delete this product unit because it is currently in use." });
        }
        res.status(500).json({ message: "Server error" });
    }
};