const prisma = require("../config/prisma"); // ตรวจสอบให้แน่ใจว่า path ไปยัง prisma client ของคุณถูกต้อง

/**
 * @desc    สร้างหน่วยใหม่ (Create Unit)
 * @route   POST /api/units
 * @access  Private
 */
exports.createUnit = async (req, res) => {
    try {
        const { name } = req.body;
        console.log(req.body);

        if (!name) {
            return res.status(400).json({ message: "Name is required" });
        }

        const unit = await prisma.unit.create({
            data: {
                name,
            },
        });

        res.status(201).json({
            message: "Unit created successfully",
            unit,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @desc    ดึงข้อมูลหน่วยทั้งหมด (Get all Units)
 * @route   GET /api/units
 * @access  Public
 */
exports.getAllUnits = async (req, res) => {
    try {
        const units = await prisma.unit.findMany({
            orderBy: {
                id: 'asc' // เรียงตาม ID จากน้อยไปมาก
            }
        });
        res.json(units);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @desc    ดึงข้อมูลหน่วยตาม ID (Get Unit by ID)
 * @route   GET /api/units/:id
 * @access  Public
 */
exports.getUnitById = async (req, res) => {
    try {
        const { id } = req.params;
        const unit = await prisma.unit.findUnique({
            where: {
                id: Number(id),
            },
        });

        if (!unit) {
            return res.status(404).json({ message: "Unit not found" });
        }

        res.json(unit);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" });
    }
};


/**
 * @desc    อัปเดตข้อมูลหน่วย (Update Unit)
 * @route   PUT /api/units/:id
 * @access  Private
 */
exports.updateUnit = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        // ตรวจสอบก่อนว่ามี Unit นี้อยู่จริงหรือไม่
        const existingUnit = await prisma.unit.findUnique({
            where: { id: Number(id) }
        });

        if (!existingUnit) {
            return res.status(404).json({ message: "Unit not found" });
        }

        const updatedUnit = await prisma.unit.update({
            where: {
                id: Number(id),
            },
            data: {
                name,
            },
        });

        res.json({
            message: "Unit updated successfully",
            unit: updatedUnit,
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * @desc    ลบข้อมูลหน่วย (Delete Unit)
 * @route   DELETE /api/units/:id
 * @access  Private
 */
exports.deleteUnit = async (req, res) => {
    try {
        const { id } = req.params;

        // ตรวจสอบก่อนว่ามี Unit นี้อยู่จริงหรือไม่
        const existingUnit = await prisma.unit.findUnique({
            where: { id: Number(id) }
        });

        if (!existingUnit) {
            return res.status(404).json({ message: "Unit not found" });
        }

        // หมายเหตุ: หากมี Drink ที่ใช้ Unit นี้อยู่ การลบอาจจะล้มเหลว
        // ขึ้นอยู่กับ onDelete constraint ใน schema ของคุณ
        await prisma.unit.delete({
            where: {
                id: Number(id),
            },
        });

        res.json({
            message: `Unit with ID ${id} deleted successfully`,
        });
    } catch (error) {
        console.log(error);
        // เพิ่มการจัดการ error กรณีที่ลบไม่ได้เพราะมี relation ผูกอยู่
        if (error.code === 'P2003') {
            return res.status(400).json({ message: "Cannot delete this unit because it is currently in use by a drink." });
        }
        res.status(500).json({ message: "Server error" });
    }
};