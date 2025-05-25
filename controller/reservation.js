const prisma = require('../config/prisma');


// 📌 CREATE RESERVATION (ปรับปรุงให้เปลี่ยนสถานะโต๊ะ)
exports.createReservation = async (req, res) => {
    try {
        const { customerId, tableId, reservationTime } = req.body;

        if (!customerId || !tableId || !reservationTime) {
            return res.status(400).json({ message: "Customer ID, Table ID, and Reservation Time are required." });
        }

        const reservationDate = new Date(reservationTime);
        const reservationHour = reservationDate.getHours();

        // 🕒 ตรวจสอบว่าเวลาจองเลย 20:00 น. หรือไม่
        if (reservationHour >= 20) {
            return res.status(400).json({ message: "ບໍ່ສາມາດຈອງໂຕະເວລາ 20:00 ນ. ຫຼື ຫຼັງຈາກນັ້ນໄດ້." });
        }

        // --- ⬇️ ตรวจสอบโต๊ะและลูกค้า (ก่อน Transaction) ⬇️ ---
        const table = await prisma.table.findUnique({
            where: { id: Number(tableId) }
        });

        if (!table) {
            return res.status(404).json({ message: "Table not found." });
        }

        // ❗️ ตรวจสอบว่าโต๊ะถูกจองไปแล้วหรือยัง
        if (table.status === 'ຖືກຈອງແລ້ວ') {
            return res.status(409).json({ message: `Table ${tableId} is already reserved (ຖືກຈອງແລ້ວ).` }); // 409 Conflict - บอกว่ามีคนจองแล้ว
        }
        // ❗️ หรือตรวจสอบสถานะอื่นๆ ที่ไม่ว่าง เช่น 'ວ່າງ' (ว่าง)
        // if (table.status !== 'ວ່າງ') {
        //     return res.status(409).json({ message: `Table ${tableId} is not available.` });
        // }


        const customer = await prisma.customer.findUnique({
            where: { id: Number(customerId) }
        });

        if (!customer) {
            return res.status(404).json({ message: "Customer not found." });
        }
        // --- ⬆️ สิ้นสุดการตรวจสอบ ⬆️ ---


        // --- ⬇️ เริ่ม Transaction ⬇️ ---
        const newReservation = await prisma.$transaction(async (tx) => {
            // 1. สร้างการจองใหม่
            const createdReservation = await tx.reservation.create({
                data: {
                    customerId: Number(customerId),
                    tableId: Number(tableId),
                    reservationTime: reservationDate,
                    status: 'pending' // หรือ 'confirmed' ตามที่คุณต้องการ
                },
                include: {
                    customer: true,
                    table: true // Include table เพื่อให้เห็นสถานะใหม่ทันที (แต่จะเห็นสถานะเก่านะ)
                }
            });

            // 2. อัปเดตสถานะโต๊ะเป็น 'ຖືກຈອງແລ້ວ'
            await tx.table.update({
                where: { id: Number(tableId) },
                data: { status: 'ຖືກຈອງແລ້ວ' }
            });

            return createdReservation; // ส่งคืนข้อมูลการจองที่สร้างขึ้น
        });
        // --- ⬆️ สิ้นสุด Transaction ⬆️ ---

        res.status(201).json(newReservation);

    } catch (error) {
        console.error("Error during reservation creation and table update:", error);
        res.status(500).json({ message: "Server Error during reservation process" });
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

        // เพิ่มสถานะอื่นๆ ที่อาจมี เช่น 'completed' (เสร็จสิ้น)
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

            // ถ้าไม่เจอ ให้โยน Error เพื่อให้ Transaction ล้มเหลว
            if (!reservation) {
                throw new Error('ReservationNotFound');
            }

            // 2. อัปเดตสถานะการจอง
            const updated = await tx.reservation.update({
                where: { id: Number(id) },
                data: { status: status },
                include: { customer: true, table: true } // Include เพื่อให้ response มีข้อมูลครบ
            });

            // 3. ถ้าสถานะเป็น 'cancelled' (หรือ 'completed') ให้อัปเดตสถานะโต๊ะ
            if (status === 'cancelled' || status === 'completed') {
                // ❗️ ข้อควรระวัง: โค้ดนี้ตั้งโต๊ะเป็น 'ว่าง' ทันที
                // ในระบบที่ซับซ้อน อาจต้องตรวจสอบก่อนว่ามี 'การจองอื่น' สำหรับโต๊ะนี้หรือไม่
                await tx.table.update({
                    where: { id: reservation.tableId },
                    data: { status: 'ວ່າງ' } // ⬅️ เปลี่ยนสถานะโต๊ะเป็น 'ว่าง'
                });

            }


            return updated;
        });
        // --- ⬆️ สิ้นสุด Transaction ⬆️ ---

        res.json(updatedReservation);

    } catch (error) {
        // จัดการ Error ที่เราโยนเอง หรือ Prisma P2025 (Record not found)
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

        // Fetch reservation first to get tableId
        const reservation = await prisma.reservation.findUnique({
            where: { id: Number(id) }
        });

        if (!reservation) {
            return res.status(404).json({ message: "Reservation not found" });
        }

        // Use transaction to ensure both operations complete successfully
        await prisma.$transaction(async (tx) => {
            // Delete the reservation
            await tx.reservation.delete({
                where: { id: Number(id) }
            });

            // Update table status to available
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
