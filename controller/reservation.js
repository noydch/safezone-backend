const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.createReservation = async (req, res) => {
    try {
        const { customerData, tableIds, reservationTime } = req.body;

        if (!customerData || !tableIds || !Array.isArray(tableIds) || tableIds.length === 0 || !reservationTime) {
            return res.status(400).json({ message: "Missing required fields or invalid tableIds" });
        }

        const parsedDate = new Date(reservationTime);
        if (isNaN(parsedDate)) {
            return res.status(400).json({ message: "Invalid reservationTime format" });
        }

        const startOfDay = new Date(parsedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(parsedDate);
        endOfDay.setHours(23, 59, 59, 999);

        // ตรวจสอบโต๊ะที่ถูกจองในวันเดียวกัน
        const conflictedReservations = await prisma.reservationTable.findMany({
            where: {
                tableId: { in: tableIds },
                reservation: {
                    reservationTime: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                },
            },
            include: { reservation: true }
        });

        if (conflictedReservations.length > 0) {
            const conflictedTableIds = [...new Set(conflictedReservations.map(r => r.tableId))];
            return res.status(409).json({
                message: `โต๊ะ ${conflictedTableIds.join(', ')} ถูกจองในวันเดียวกันแล้ว`
            });
        }

        // Transaction
        const { customer, reservation, updatedTables } = await prisma.$transaction(async (tx) => {
            // หา หรือ สร้างลูกค้า
            let existingCustomer = await tx.customer.findUnique({
                where: { phone: customerData.phone }
            });

            if (!existingCustomer) {
                existingCustomer = await tx.customer.create({ data: customerData });
            }

            // สร้าง reservation
            const reservation = await tx.reservation.create({
                data: {
                    reservationTime: parsedDate,
                    status: "pending",
                    customer: { connect: { id: existingCustomer.id } }
                }
            });

            // สร้าง ReservationTable สำหรับทุกโต๊ะ
            for (const tableId of tableIds) {
                await tx.reservationTable.create({
                    data: {
                        reservationId: reservation.id,
                        tableId
                    }
                });
            }

            // อัปเดตสถานะโต๊ะ
            const updatedTables = [];
            for (const tableId of tableIds) {
                const updated = await tx.table.update({
                    where: { id: tableId },
                    data: { status: 'ຖືກຈອງແລ້ວ' }
                });
                updatedTables.push(updated);
            }

            return { customer: existingCustomer, reservation, updatedTables };
        });

        res.status(201).json({
            message: "Reservation created successfully",
            customer,
            reservation,
            updatedTables
        });

    } catch (error) {
        console.error("Create reservation error:", error);
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "Duplicate entry detected." });
        }
        res.status(500).json({ message: "Internal server error" });
    }
};

// 📌 GET ALL RESERVATIONS
// ตัวอย่าง getAllReservations
exports.getAllReservations = async (req, res) => {
    try {
        const reservations = await prisma.reservation.findMany({
            include: {
                customer: true,
                reservationTables: {
                    include: { table: true }
                }
            },
            orderBy: { reservationTime: 'asc' }
        });
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
                reservationTables: {
                    include: { table: true }
                }
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

        const allowedStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: `Invalid status. Allowed statuses: ${allowedStatuses.join(', ')}` });
        }

        const updatedReservation = await prisma.$transaction(async (tx) => {
            const reservation = await tx.reservation.findUnique({
                where: { id: Number(id) },
                include: { reservationTables: true }
            });

            if (!reservation) {
                throw new Error('ReservationNotFound');
            }

            const updated = await tx.reservation.update({
                where: { id: Number(id) },
                data: { status },
                include: { customer: true, reservationTables: { include: { table: true } } }
            });

            // ถ้าสถานะเป็น cancelled หรือ completed ให้ตั้งสถานะโต๊ะเป็น "ວ່າງ"
            if (['cancelled', 'completed'].includes(status)) {
                for (const rt of reservation.reservationTables) {
                    await tx.table.update({
                        where: { id: rt.tableId },
                        data: { status: 'ວ່າງ' }
                    });
                }
            }

            return updated;
        });

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
            where: { id: Number(id) },
            include: { reservationTables: true }
        });

        if (!reservation) {
            return res.status(404).json({ message: "Reservation not found" });
        }

        await prisma.$transaction(async (tx) => {
            // ลบ reservationTable ทั้งหมดก่อน
            await tx.reservationTable.deleteMany({
                where: { reservationId: Number(id) }
            });

            // ลบ reservation
            await tx.reservation.delete({
                where: { id: Number(id) }
            });

            // อัปเดตสถานะโต๊ะทั้งหมดที่เกี่ยวข้องเป็น ว่าง
            for (const rt of reservation.reservationTables) {
                await tx.table.update({
                    where: { id: rt.tableId },
                    data: { status: 'ວ່າງ' }
                });
            }
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
