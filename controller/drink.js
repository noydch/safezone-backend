const prisma = require('../config/prisma');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: 'dnplboikb',
    api_key: '298611556276172',
    api_secret: 's-vdRpifR_1slH-EXvz2Ha2Mx4o',
    secure: true,
});

// ====================================================================================
// 📌 CREATE DRINK (แก้ไข Logic ทั้งหมด)
// ====================================================================================
exports.createDrink = async (req, res) => {
    try {
        const { name, categoryId, baseUnitId, price, qty } = req.body;

        if (!name || !baseUnitId || !price) {
            return res.status(400).json({ error: "Name, baseUnitId, and price for single unit are required" });
        }
        if (!req.file) {
            return res.status(400).json({ error: "Image file is required" });
        }

        cloudinary.uploader.upload_stream(
            { folder: "safezone-project" },
            async (error, result) => {
                if (error) {
                    console.error("Cloudinary upload error:", error);
                    return res.status(500).json({ error: "Image Upload Failed" });
                }

                try {
                    const createdData = await prisma.$transaction(async (tx) => {

                        // ✨ 1. ดึงข้อมูลหน่วยพื้นฐาน (Base Unit) เพื่อเอาชื่อมาใช้ ✨
                        const baseUnit = await tx.unit.findUnique({
                            where: { id: parseInt(baseUnitId) },
                        });

                        if (!baseUnit) {
                            // ถ้าหา baseUnitId ไม่เจอ ให้โยน error เพื่อให้ transaction rollback
                            throw new Error('Base unit not found.');
                        }

                        // 2. สร้าง Drink record หลัก
                        const newDrink = await tx.drink.create({
                            data: {
                                name,
                                categoryId: categoryId ? parseInt(categoryId) : null,
                                baseUnitId: parseInt(baseUnitId),
                                qty: qty ? parseInt(qty) : 0,
                                imageUrl: result.secure_url
                            }
                        });

                        // ✨ 3. สร้าง ProductUnit สำหรับขายเป็น "หน่วยเดี่ยว" โดยใช้ชื่อจาก baseUnit ✨
                        await tx.productUnit.create({
                            data: {
                                name: `${name} (${baseUnit.name})`, // <-- ใช้ชื่อจาก baseUnit ที่ดึงมา
                                price: parseFloat(price),
                                baseItemsCount: 1, // 1 หน่วยเดี่ยว = 1 หน่วยพื้นฐาน
                                drinkId: newDrink.id
                            }
                        });

                        // 4. ดึงข้อมูลทั้งหมดที่สร้างขึ้นเพื่อส่งกลับ
                        return tx.drink.findUnique({
                            where: { id: newDrink.id },
                            include: {
                                Category: true,
                                baseUnit: true,
                                productUnits: true
                            }
                        });
                    });

                    res.status(201).json(createdData);

                } catch (txError) {
                    await cloudinary.uploader.destroy(result.public_id);
                    console.error("Transaction Error creating drink:", txError);
                    res.status(500).json({ message: "Database transaction failed.", error: txError.message });
                }
            }
        ).end(req.file.buffer);

    } catch (error) {
        console.error("Error creating drink:", error);
        res.status(500).json({ message: "Server Error" });
    }
};


// ====================================================================================
// 📌 GET ALL DRINKS (แก้ไข Include)
// ====================================================================================
exports.getDrink = async (req, res) => {
    try {
        // --- ⬇️ แก้ไข: Include ข้อมูลที่เกี่ยวข้องทั้งหมดเพื่อให้ Frontend ใช้งานง่าย ⬇️ ---
        const drinks = await prisma.drink.findMany({
            include: {
                Category: true,     // หมวดหมู่
                baseUnit: true,     // หน่วยพื้นฐาน (ขวด, กระป๋อง)
                productUnits: true  // หน่วยขายทั้งหมดของเครื่องดื่มนี้ (หน่วยเดี่ยว, ลัง, แพ็ค)
            },
            orderBy: {
                id: 'asc'
            }
        });
        // --- ⬆️ สิ้นสุดการแก้ไข ⬆️ ---

        res.send(drinks);
    } catch (error) {
        console.error("Error fetching drinks:", error);
        res.status(500).json({ message: "Server Error" });
    }
};


// ====================================================================================
// 📌 DELETE DRINK (Logic เดิมใช้ได้ แต่เพิ่มความเข้าใจเรื่อง Cascade)
// ====================================================================================
exports.deleteDrink = async (req, res) => {
    // หมายเหตุ: Logic นี้จะทำงานถูกต้องเมื่อใน Schema ของ ProductUnit มี `onDelete: Cascade`
    // การลบ Drink จะทำให้ ProductUnit ที่เกี่ยวข้องถูกลบตามไปด้วยโดยอัตโนมัติ
    try {
        const { id } = req.params;
        const drink = await prisma.drink.findUnique({
            where: { id: Number(id) }
        });

        if (!drink) {
            return res.status(404).json({ message: "Drink not found" });
        }

        // ลบรูปภาพจาก Cloudinary
        if (drink.imageUrl) {
            const publicId = drink.imageUrl.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(`safezone-project/${publicId}`);
        }

        // ลบเครื่องดื่มจากฐานข้อมูล (ProductUnits จะถูกลบตามไปด้วย)
        await prisma.drink.delete({
            where: { id: Number(id) }
        });

        res.json({ message: "Drink and related product units deleted successfully" });
    } catch (error) {
        console.error("Error deleting drink:", error);
        if (error.code === 'P2003') { // กรณีถูกใช้งานใน OrderDetail
            return res.status(400).json({ message: "Cannot delete this drink because it is part of an existing order." });
        }
        res.status(500).json({ message: "Server Error" });
    }
};


// ====================================================================================
// 📌 UPDATE DRINK (แก้ไข Logic การอัปเดต)
// ====================================================================================
exports.updateDrink = async (req, res) => {
    try {
        const { id } = req.params;
        // --- ⬇️ แก้ไข: รับ Input ใหม่ตาม Schema (ไม่มี price) ⬇️ ---
        const { name, categoryId, baseUnitId, qty } = req.body;
        // การอัปเดตราคา จะต้องทำผ่าน ProductUnit Controller
        // --- ⬆️ สิ้นสุดการแก้ไข ⬆️ ---

        const drink = await prisma.drink.findUnique({
            where: { id: Number(id) }
        });

        if (!drink) {
            return res.status(404).json({ message: "Drink not found" });
        }

        let imageUrl = drink.imageUrl;
        if (req.file) {
            // ลบรูปเดิมถ้ามี
            if (drink.imageUrl) {
                const publicId = drink.imageUrl.split('/').pop().split('.')[0];
                await cloudinary.uploader.destroy(`safezone-project/${publicId}`);
            }

            // อัปโหลดรูปใหม่
            const uploadResult = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { folder: "safezone-project" },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                ).end(req.file.buffer);
            });
            imageUrl = uploadResult.secure_url;
        }

        // --- ⬇️ แก้ไข: อัปเดตข้อมูลเฉพาะ field ที่มีใน Drink model ⬇️ ---
        const updatedDrink = await prisma.drink.update({
            where: { id: Number(id) },
            data: {
                name: name || undefined,
                categoryId: categoryId ? parseInt(categoryId) : undefined,
                baseUnitId: baseUnitId ? parseInt(baseUnitId) : undefined,
                qty: qty ? parseInt(qty) : undefined,
                imageUrl
            },
            include: { // ส่งข้อมูลที่อัปเดตแล้วกลับไปแบบเต็ม
                Category: true,
                baseUnit: true,
                productUnits: true
            }
        });
        // --- ⬆️ สิ้นสุดการแก้ไข ⬆️ ---

        res.json(updatedDrink);
    } catch (error) {
        console.error("Error updating drink:", error);
        res.status(500).json({ message: "Server Error" });
    }
};