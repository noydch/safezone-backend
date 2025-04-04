const prisma = require('../config/prisma');

// 📌 CREATE RESERVATION
exports.createReservation = async (req, res) => {
    try {
        const { customerId, tableId, reservationTime } = req.body;

        if (!customerId || !tableId || !reservationTime) {
            return res.status(400).json({ message: "Customer ID, Table ID, and Reservation Time are required." });
        }

        // Optional: Check if table exists and maybe if it's available ('ວ່າງ')
        const table = await prisma.table.findUnique({
            where: { id: Number(tableId) }
        });

        if (!table) {
            return res.status(404).json({ message: "Table not found." });
        }

        // Add check for customer existence if needed
        const customer = await prisma.customer.findUnique({
             where: { id: Number(customerId) }
        });

        if (!customer) {
            console.log("customer =", customer);
            console.log("customerId =>", customerId);
             return res.status(404).json({ message: "Customer not found." });
        }

        // Consider adding logic here to check for conflicting reservations
        // For example, check if this table is already reserved around the requested reservationTime

        const newReservation = await prisma.reservation.create({
            data: {
                customerId: Number(customerId),
                tableId: Number(tableId),
                reservationTime: new Date(reservationTime), // Ensure it's a Date object
                // status defaults to 'pending' as per schema
            },
            include: {
                customer: true, // Include customer details
                table: true     // Include table details
            }
        });

        // Optional: Update table status to 'reserved' or similar
        // await prisma.table.update({
        //     where: { id: Number(tableId) },
        //     data: { status: 'reserved' } // Adjust status value as needed
        // });

        res.status(201).json(newReservation);
    } catch (error) {
        console.error("Error creating reservation:", error);
        res.status(500).json({ message: "Server Error creating reservation" });
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

// 📌 UPDATE RESERVATION STATUS
exports.updateReservationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Expecting status like 'confirmed', 'cancelled'

        if (!status) {
            return res.status(400).json({ message: "Status is required." });
        }

        // Optional: Add validation for allowed status values
        const allowedStatuses = ['pending', 'confirmed', 'cancelled'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: `Invalid status. Allowed statuses are: ${allowedStatuses.join(', ')}` });
        }

        const updatedReservation = await prisma.reservation.update({
            where: { id: Number(id) },
            data: {
                status: status
            },
            include: {
                customer: true,
                table: true
            }
        });

        // Optional: Update table status based on reservation status
        // if (status === 'confirmed') {
        //     await prisma.table.update({ where: { id: updatedReservation.tableId }, data: { status: 'reserved' } });
        // } else if (status === 'cancelled' || status === 'pending') {
        //     // Check if other confirmed reservations exist for this table before setting back to 'available'
        //     await prisma.table.update({ where: { id: updatedReservation.tableId }, data: { status: 'ວ່າງ' } });
        // }

        res.json(updatedReservation);
    } catch (error) {
         if (error.code === 'P2025') { // Prisma code for record not found
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

        // Optional: Fetch reservation first to get tableId if needed for table status update
        // const reservation = await prisma.reservation.findUnique({ where: { id: Number(id) } });
        // if (!reservation) {
        //     return res.status(404).json({ message: "Reservation not found" });
        // }

        await prisma.reservation.delete({
            where: { id: Number(id) }
        });

        // Optional: Update table status back to 'available' ('ວ່າງ')
        // Need to be careful here - only set to available if no other reservations exist for it
        // if (reservation) {
        //     await prisma.table.update({ where: { id: reservation.tableId }, data: { status: 'ວ່າງ' } });
        // }

        res.json({ message: "Reservation deleted successfully" });
    } catch (error) {
        if (error.code === 'P2025') { // Prisma code for record not found
            return res.status(404).json({ message: "Reservation not found" });
        }
        console.error("Error deleting reservation:", error);
        res.status(500).json({ message: "Server Error deleting reservation" });
    }
};
