const prisma = require('../config/prisma');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: 'dnplboikb',
    api_key: '298611556276172',
    api_secret: 's-vdRpifR_1slH-EXvz2Ha2Mx4o',
    secure: true,
});

// 📌 CREATE DRINK
exports.createDrink = async (req, res) => {
    try {
        const { name, categoryId, qty, price } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: "Image file is required" });
        }

        cloudinary.uploader.upload_stream(
            { folder: "safezone-project" },
            async (error, result) => {
                if (error) {
                    return res.status(500).json({ error: "Upload Failed" });
                }

                // Save drink to DB
                const drink = await prisma.drink.create({
                    data: {
                        name,
                        categoryId: parseInt(categoryId),
                        qty: qty ? parseInt(qty) : null,
                        price: parseFloat(price),
                        imageUrl: result.secure_url
                    }
                });

                res.json(drink);
            }
        ).end(req.file.buffer);

    } catch (error) {
        console.error("Error creating drink:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 📌 GET ALL DRINKS
exports.getDrink = async (req, res) => {
    try {
        const drink = await prisma.drink.findMany({
            // include: { category: true }
        });

        res.send(drink);
    } catch (error) {
        console.error("Error fetching drinks:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 📌 DELETE DRINK
exports.deleteDrink = async (req, res) => {
    try {
        const { id } = req.params;

        // ค้นหาเครื่องดื่มก่อน
        const drink = await prisma.drink.findUnique({
            where: { id: Number(id) }
        });

        if (!drink) {
            return res.status(404).json({ message: "Drink not found" });
        }

        // ดึง public_id ของรูปจาก Cloudinary
        const imageUrl = drink.imageUrl;
        const publicId = imageUrl ? imageUrl.split('/').pop().split('.')[0] : null;

        // ลบรูปภาพจาก Cloudinary ถ้ามี
        if (publicId) {
            const cloudinaryResponse = await cloudinary.uploader.destroy(`safezone-project/${publicId}`);
            if (cloudinaryResponse.result !== "ok") {
                return res.status(500).json({ message: "Failed to delete image from Cloudinary" });
            }
        }

        // ลบเครื่องดื่มจากฐานข้อมูล
        await prisma.drink.delete({
            where: { id: Number(id) }
        });

        res.json({ message: "Drink deleted successfully" });
    } catch (error) {
        console.error("Error deleting drink:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 📌 UPDATE DRINK
exports.updateDrink = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, categoryId, qty, price } = req.body;

        // ค้นหาเครื่องดื่มก่อนอัปเดต
        const drink = await prisma.drink.findUnique({
            where: { id: Number(id) }
        });

        if (!drink) {
            return res.status(404).json({ message: "Drink not found" });
        }

        let imageUrl = drink.imageUrl;

        if (req.file) {
            // ลบรูปเดิมจาก Cloudinary
            const publicId = imageUrl ? imageUrl.split('/').pop().split('.')[0] : null;
            if (publicId) {
                await cloudinary.uploader.destroy(`safezone-project/${publicId}`);
            }

            // อัปโหลดรูปใหม่
            const uploadResult = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: "safezone-project" },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                uploadStream.end(req.file.buffer);
            });

            imageUrl = uploadResult.secure_url;
        }

        // อัปเดตข้อมูลเครื่องดื่ม
        const updatedDrink = await prisma.drink.update({
            where: { id: Number(id) },
            data: {
                name,
                categoryId: parseInt(categoryId),
                qty: qty ? parseInt(qty) : null,
                price: parseFloat(price),
                imageUrl
            }
        });

        res.json(updatedDrink);
    } catch (error) {
        console.error("Error updating drink:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
