const prisma = require("../config/prisma");

exports.reservation = async (req, res) => {
    try {
        const { fname, lname, phone, tableId, reservationTime } = req.body;

        const availableTable = await prisma.table.findUnique({
            where: { id: parseInt(tableId), status: "ວ່າງ" },
        });

        if (!availableTable) {
            return res.status(400).json({ message: "Table is not available." });
        }

        // Find existing customer or create new one
        let customer = await prisma.customer.findFirst({
            where: { phone }
        });

        if (!customer) {
            customer = await prisma.customer.create({
                data: { fname, lname, phone }
            });
        }

        const reservation = await prisma.reservation.create({
            data: {
                customer: {
                    connect: { id: customer.id }
                },
                table: { connect: { id: parseInt(tableId) } },
                reservationTime: new Date(reservationTime),
                status: "confirmed",
            },
        });

        console.log(availableTable);

        await prisma.table.update({
            where: { id: parseInt(tableId) },
            data: { status: "reserved" },
        });

        res.status(201).json({ message: "Reservation successful", reservation });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
}