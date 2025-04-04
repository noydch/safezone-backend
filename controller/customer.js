const prisma = require('../config/prisma');

// 📌 CREATE CUSTOMER
exports.createCustomer = async (req, res) => {
    try {
        const { fname, lname, phone } = req.body;

        if (!fname || !lname || !phone) {
            return res.status(400).json({ message: "First name, last name, and phone number are required." });
        }

        // Check if customer with this phone number already exists
        const existingCustomer = await prisma.customer.findUnique({
            where: { phone: phone }
        });

        if (existingCustomer) {
            return res.status(409).json({ message: "Customer with this phone number already exists." }); // 409 Conflict
        }

        const newCustomer = await prisma.customer.create({
            data: {
                fname,
                lname,
                phone
            }
        });

        res.status(201).json(newCustomer);
    } catch (error) {
        console.error("Error creating customer:", error);
        // Handle potential unique constraint violation if the check above somehow fails
        if (error.code === 'P2002' && error.meta?.target?.includes('phone')) {
            return res.status(409).json({ message: "Customer with this phone number already exists." });
        }
        res.status(500).json({ message: "Server Error creating customer" });
    }
};

// 📌 GET ALL CUSTOMERS
exports.getAllCustomers = async (req, res) => {
    try {
        const customers = await prisma.customer.findMany({
            orderBy: {
                createdAt: 'desc' // Optional: Order by creation date
            }
        });
        res.json(customers);
    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ message: "Server Error fetching customers" });
    }
};

// 📌 GET CUSTOMER BY ID
exports.getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await prisma.customer.findUnique({
            where: { id: Number(id) }
        });

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }
        res.json(customer);
    } catch (error) {
        console.error("Error fetching customer by ID:", error);
        res.status(500).json({ message: "Server Error fetching customer" });
    }
};

// 📌 UPDATE CUSTOMER
exports.updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { fname, lname, phone } = req.body;

        // Optional: Add validation for input data

        // Check if another customer already uses the new phone number (if provided)
        if (phone) {
            const existingCustomer = await prisma.customer.findFirst({
                where: {
                    phone: phone,
                    NOT: {
                        id: Number(id) // Exclude the current customer being updated
                    }
                }
            });
            if (existingCustomer) {
                return res.status(409).json({ message: "Another customer with this phone number already exists." });
            }
        }

        const updatedCustomer = await prisma.customer.update({
            where: { id: Number(id) },
            data: {
                fname,
                lname,
                phone
                // Only update fields that are provided
                // Alternatively, fetch the customer first and merge data
            }
        });

        res.json(updatedCustomer);
    } catch (error) {
         if (error.code === 'P2002' && error.meta?.target?.includes('phone')) {
            return res.status(409).json({ message: "Another customer with this phone number already exists." });
        }
         if (error.code === 'P2025') { // Prisma code for record not found for update
            return res.status(404).json({ message: "Customer not found" });
        }
        console.error("Error updating customer:", error);
        res.status(500).json({ message: "Server Error updating customer" });
    }
};

// 📌 DELETE CUSTOMER
exports.deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;

        // Optional: Check if customer has related reservations before deleting
        const reservations = await prisma.reservation.findMany({
            where: { customerId: Number(id) }
        });

        if (reservations.length > 0) {
            return res.status(400).json({ message: "Cannot delete customer with active reservations. Please cancel reservations first." });
        }

        await prisma.customer.delete({
            where: { id: Number(id) }
        });

        res.json({ message: "Customer deleted successfully" });
    } catch (error) {
        if (error.code === 'P2025') { // Prisma code for record not found for delete
            return res.status(404).json({ message: "Customer not found" });
        }
         // Handle foreign key constraint errors if schema changes (e.g., P2003)
        console.error("Error deleting customer:", error);
        res.status(500).json({ message: "Server Error deleting customer" });
    }
}; 