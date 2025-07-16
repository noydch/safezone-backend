const prisma = require('../config/prisma');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: 'dnplboikb',
    api_key: '298611556276172',
    api_secret: 's-vdRpifR_1slH-EXvz2Ha2Mx4o',
    secure: true,
});

// 📌 CREATE FOOD
exports.createFood = async (req, res) => {
    try {
        const { name, categoryId, price, qty } = req.body;
        console.log(categoryId);

        if (!req.file) {
            return res.status(400).json({ error: "Image file is required" });
        }

        cloudinary.uploader.upload_stream(
            { folder: "safezone-project" },
            async (error, result) => {
                if (error) {
                    return res.status(500).json({ error: "Upload Failed" });
                }

                // Save food to DB
                const food = await prisma.food.create({
                    data: {
                        name,
                        categoryId: parseInt(categoryId),
                        price: parseInt(price),
                        imageUrl: result.secure_url
                    }
                });

                res.json(food);
            }
        ).end(req.file.buffer);

    } catch (error) {
        console.error("Error creating food:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 📌 GET ALL FOODS
exports.getFood = async (req, res) => {
    try {
        const food = await prisma.food.findMany({
            include: { category: true }
        });

        res.send(food);
    } catch (error) {
        console.error("Error fetching foods:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 📌 DELETE FOOD
exports.deleteFood = async (req, res) => {
    try {
        const { id } = req.params;

        // ค้นหาอาหารก่อน
        const food = await prisma.food.findUnique({
            where: { id: Number(id) }
        });

        if (!food) {
            return res.status(404).json({ message: "Food not found" });
        }

        // ดึง public_id ของรูปจาก Cloudinary
        const imageUrl = food.imageUrl;
        const publicId = imageUrl ? imageUrl.split('/').pop().split('.')[0] : null;

        // ลบรูปภาพจาก Cloudinary ถ้ามี
        if (publicId) {
            const cloudinaryResponse = await cloudinary.uploader.destroy(`safezone-project/${publicId}`);
            if (cloudinaryResponse.result !== "ok") {
                return res.status(500).json({ message: "Failed to delete image from Cloudinary" });
            }
        }

        // ลบอาหารจากฐานข้อมูล
        await prisma.food.delete({
            where: { id: Number(id) }
        });

        res.json({ message: "Food deleted successfully" });
    } catch (error) {
        console.error("Error deleting food:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 📌 UPDATE FOOD
exports.updateFood = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, categoryId, qty, price } = req.body;

        // ค้นหาอาหารก่อนอัปเดต
        const food = await prisma.food.findUnique({
            where: { id: Number(id) }
        });

        if (!food) {
            return res.status(404).json({ message: "Food not found" });
        }

        let imageUrl = food.imageUrl;

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

        // อัปเดตข้อมูลอาหาร
        const updatedFood = await prisma.food.update({
            where: { id: Number(id) },
            data: {
                name,
                categoryId: parseInt(categoryId),
                price: parseInt(price),
                imageUrl
            }
        });

        res.json(updatedFood);
    } catch (error) {
        console.error("Error updating food:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 📌 GET DRINK REPORT ONLY
exports.getDrinkReport = async (req, res) => {
    try {
        const drinks = await prisma.drink.findMany({
            include: {
                Category: true,
                productUnits: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        baseItemsCount: true
                    }
                }
            }
        });

        res.json({ drinks });
    } catch (error) {
        console.error("Error generating drink report:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

