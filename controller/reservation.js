const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.createReservation = async (req, res) => {
    try {
        const { customerData, tableId, reservationTime } = req.body;

        // เช็คข้อมูลที่จำเป็น
        if (!customerData || !tableId || !reservationTime) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // แปลง string เป็น Date
        const parsedDate = new Date(reservationTime);
        if (isNaN(parsedDate)) {
            return res.status(400).json({ message: "Invalid reservationTime format" });
        }

        // ตรวจสอบว่ามีการจองโต๊ะในวันเดียวกันหรือยัง
        const startOfDay = new Date(parsedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(parsedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const existingReservation = await prisma.reservation.findFirst({
            where: {
                tableId: Number(tableId),
                reservationTime: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
        });

        if (existingReservation) {
            const reservedDateStr = new Date(existingReservation.reservationTime).toLocaleDateString('th-TH');
            return res.status(409).json({
                message: `ໂຕະນີ້ຖືກຈອງໃນວັນທີ ${reservedDateStr} ແລ້ວ`
            });
        }

        // เริ่ม transaction
        const { customer, reservation, updatedTable } = await prisma.$transaction(async (tx) => {
            // หาลูกค้าจากเบอร์โทร
            let existingCustomer = await tx.customer.findUnique({
                where: { phone: customerData.phone }
            });

            // ถ้าไม่มีลูกค้า ให้สร้างใหม่
            if (!existingCustomer) {
                existingCustomer = await tx.customer.create({
                    data: customerData
                });
            }

            // สร้างการจอง เชื่อม customer และ table
            const reservation = await tx.reservation.create({
                data: {
                    reservationTime: parsedDate,
                    table: { connect: { id: Number(tableId) } },
                    customer: { connect: { id: existingCustomer.id } },
                }
            });

            // อัปเดตสถานะโต๊ะ
            const updatedTable = await tx.table.update({
                where: { id: Number(tableId) },
                data: { status: 'ຖືກຈອງແລ້ວ' }
            });

            return { customer: existingCustomer, reservation, updatedTable };
        });

        // ส่งผลลัพธ์กลับ
        res.status(201).json({
            message: "Reservation created successfully",
            customer,
            reservation
        });

    } catch (error) {
        console.error("Create reservation error:", error);

        // กรณี unique constraint อื่นๆ
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "Duplicate entry detected." });
        }

        res.status(500).json({ message: "Internal server error" });
    }
};



// 📌 GET ALL RESERVATIONS
exports.getAllReservations = async (req, res) => {
    try {
        const reservations = await prisma.reservation.findMany({
            include: {
                customer: true,
                table: true
            },
            orderBy: {
                reservationTime: 'asc' // Order by reservation time
            }
        });
        // Prisma returns Date objects for DateTime fields. These are technically UTC
        // but JavaScript's Date.prototype.toString() or JSON.stringify() might output them
        // in local time or ISO format. The frontend is responsible for displaying them.
        res.json(reservations);
    } catch (error) {
        console.error("Error fetching reservations:", error);
        res.status(500).json({ message: "Server Error fetching reservations" });
    }
};

// 📌 GET RESERVATION BY ID
exports.getReservationById = async (req, res) => {
    try {
        const { id } = req.params;
        const reservation = await prisma.reservation.findUnique({
            where: { id: Number(id) },
            include: {
                customer: true,
                table: true
            }
        });

        if (!reservation) {
            return res.status(404).json({ message: "Reservation not found" });
        }
        res.json(reservation);
    } catch (error) {
        console.error("Error fetching reservation by ID:", error);
        res.status(500).json({ message: "Server Error fetching reservation" });
    }
};

// 📌 UPDATE RESERVATION STATUS (ปรับปรุงให้เปลี่ยนสถานะโต๊ะเมื่อยกเลิก)
exports.updateReservationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ message: "Status is required." });
        }

        const allowedStatuses = ['pending', 'confirmed', 'cancelled'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: `Invalid status. Allowed statuses are: ${allowedStatuses.join(', ')}` });
        }

        // --- ⬇️ เริ่ม Transaction ⬇️ ---
        const updatedReservation = await prisma.$transaction(async (tx) => {
            // 1. ค้นหาการจองเดิมเพื่อเอา tableId
            const reservation = await tx.reservation.findUnique({
                where: { id: Number(id) },
            });

            if (!reservation) {
                throw new Error('ReservationNotFound');
            }

            // 2. อัปเดตสถานะการจอง
            const updated = await tx.reservation.update({
                where: { id: Number(id) },
                data: { status: status },
                include: { customer: true, table: true }
            });

            // 3. ถ้าสถานะเป็น 'cancelled' (หรือ 'completed') ให้อัปเดตสถานะโต๊ะ
            if (status === 'cancelled' || status === 'completed') {
                await tx.table.update({
                    where: { id: reservation.tableId },
                    data: { status: 'ວ່າງ' }
                });
            }

            return updated;
        });
        // --- ⬆️ สิ้นสุด Transaction ⬆️ ---

        res.json(updatedReservation);

    } catch (error) {
        if (error.message === 'ReservationNotFound' || error.code === 'P2025') {
            return res.status(404).json({ message: "Reservation not found" });
        }
        console.error("Error updating reservation status:", error);
        res.status(500).json({ message: "Server Error updating reservation status" });
    }
};

// 📌 DELETE RESERVATION
exports.deleteReservation = async (req, res) => {
    try {
        const { id } = req.params;

        const reservation = await prisma.reservation.findUnique({
            where: { id: Number(id) }
        });

        if (!reservation) {
            return res.status(404).json({ message: "Reservation not found" });
        }

        await prisma.$transaction(async (tx) => {
            await tx.reservation.delete({
                where: { id: Number(id) }
            });

            await tx.table.update({
                where: { id: reservation.tableId },
                data: { status: 'ວ່າງ' }
            });
        });

        res.json({ message: "Reservation deleted successfully" });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ message: "Reservation not found" });
        }
        console.error("Error deleting reservation:", error);
        res.status(500).json({ message: "Server Error deleting reservation" });
    }
};