const prisma = require('../config/prisma');

// 📌 CREATE RESERVATION (ปรับปรุงให้เปลี่ยนสถานะโต๊ะ)
exports.createReservation = async (req, res) => {
    try {
        const { customerId, tableId, reservationTime } = req.body;
        console.log("Request Body received for createReservation:", req.body); // Log full request body

        if (!customerId || !tableId || !reservationTime) {
            return res.status(400).json({ message: "Customer ID, Table ID, and Reservation Time are required." });
        }

        // --- Debugging incoming time ---
        console.log("Incoming reservationTime string (from frontend):", reservationTime);
        const reservationDate = new Date(reservationTime); // Parse ISO string into Date object (this is UTC)
        console.log("Parsed reservationDate object (on backend, in server's local time):", reservationDate);

        // --- Logic: Prevent bookings for today at or after 20:00 (8 PM local time) ---
        const now = new Date(); // Current date and time on the server (local timezone: GMT+7 in Thailand)

        // Extract components for comparison in the server's local timezone
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const currentDay = now.getDate();

        const reservationYear = reservationDate.getFullYear();
        const reservationMonth = reservationDate.getMonth();
        const reservationDay = reservationDate.getDate();
        const reservationHour = reservationDate.getHours(); // Hour in server's local time

        // Check if the reservation date is today
        const isReservationToday = (
            reservationYear === currentYear &&
            reservationMonth === currentMonth &&
            reservationDay === currentDay
        );

        // If it's today AND the reservation hour is 8 PM (20:00) or later, reject the booking.
        if (isReservationToday && reservationHour >= 20) {
            console.log(`Attempted booking for today (${reservationDate.toLocaleDateString()}) at ${reservationHour}:00 (local time) which is >= 20:00. Rejecting.`);
            return res.status(400).json({
                message: "ບໍ່ສາມາດຈອງໂຕະສຳເລັດໄດ້. ການຈອງໃນວັນນີ້ຫຼັງຈາກ 20:00 ນ. ຈະຖືກຍົກເລີກອັດຕະໂນມັດ."
            });
        }
        // --- End of specific time validation logic ---


        // --- ⬇️ Check Table and Customer Existence (before Transaction) ⬇️ ---
        const table = await prisma.table.findUnique({
            where: { id: Number(tableId) }
        });

        if (!table) {
            return res.status(404).json({ message: "Table not found." });
        }

        // ❗️ Check if table is already reserved
        if (table.status === 'ຖືກຈອງແລ້ວ') {
            return res.status(409).json({ message: `Table ${tableId} is already reserved (ຖືກຈອງແລ້ວ).` });
        }

        const customer = await prisma.customer.findUnique({
            where: { id: Number(customerId) }
        });

        if (!customer) {
            return res.status(404).json({ message: "Customer not found." });
        }
        // --- ⬆️ End Table and Customer Checks ⬆️ ---


        // --- ⬇️ Start Transaction: Create Reservation and Update Table Status ⬇️ ---
        const newReservation = await prisma.$transaction(async (tx) => {
            // 1. Create the new reservation
            const createdReservation = await tx.reservation.create({
                data: {
                    customerId: Number(customerId),
                    tableId: Number(tableId),
                    reservationTime: reservationDate, // Prisma will correctly store this Date object as UTC
                    status: 'pending' // Or 'confirmed' as per your flow
                },
                include: {
                    customer: true,
                    table: true
                }
            });

            // 2. Update the table status to 'ຖືກຈອງແລ້ວ' (reserved)
            await tx.table.update({
                where: { id: Number(tableId) },
                data: { status: 'ຖືກຈອງແລ້ວ' }
            });

            return createdReservation; // Return the created reservation data
        });
        // --- ⬆️ End Transaction ⬆️ ---

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