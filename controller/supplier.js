const prisma = require('../config/prisma');

// 📌 CREATE SUPPLIER
exports.createSupplier = async (req, res) => {
    try {
        const { name, address, phone, email } = req.body;

        if (!name || !address || !phone || !email) {
            return res.status(400).json({ message: "Name, address, phone, and email are required." });
        }

        // Optional: Add validation for email format or phone number format

        // Optional: Check if supplier with this email or phone already exists if they should be unique
        // const existingSupplier = await prisma.supplier.findFirst({
        //     where: { OR: [{ email: email }, { phone: phone }] }
        // });
        // if (existingSupplier) {
        //     return res.status(409).json({ message: "Supplier with this email or phone already exists." });
        // }

        const newSupplier = await prisma.supplier.create({
            data: {
                name,
                address,
                phone,
                email
            }
        });

        res.status(201).json(newSupplier);
    } catch (error) {
        console.error("Error creating supplier:", error);
        // Add specific error handling if needed (e.g., for unique constraints if added to schema)
        res.status(500).json({ message: "Server Error creating supplier" });
    }
};

// 📌 GET ALL SUPPLIERS
exports.getAllSuppliers = async (req, res) => {
    try {
        const suppliers = await prisma.supplier.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.json(suppliers);
    } catch (error) {
        console.error("Error fetching suppliers:", error);
        res.status(500).json({ message: "Server Error fetching suppliers" });
    }
};

// 📌 GET SUPPLIER BY ID
exports.getSupplierById = async (req, res) => {
    try {
        const { id } = req.params;
        const supplier = await prisma.supplier.findUnique({
            where: { id: Number(id) }
        });

        if (!supplier) {
            return res.status(404).json({ message: "Supplier not found" });
        }
        res.json(supplier);
    } catch (error) {
        console.error("Error fetching supplier by ID:", error);
        res.status(500).json({ message: "Server Error fetching supplier" });
    }
};

// 📌 UPDATE SUPPLIER
exports.updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, phone, email } = req.body;

        // Optional: Add validation for input data

        // Optional: Check for uniqueness constraints if email/phone are updated

        const updatedSupplier = await prisma.supplier.update({
            where: { id: Number(id) },
            data: {
                name,
                address,
                phone,
                email
                // Only update fields that are provided
                // data: Object.fromEntries(Object.entries({ name, address, phone, email }).filter(([_, v]) => v !== undefined))
            }
        });

        res.json(updatedSupplier);
    } catch (error) {
        if (error.code === 'P2025') { // Prisma code for record not found for update
            return res.status(404).json({ message: "Supplier not found" });
        }
        console.error("Error updating supplier:", error);
        res.status(500).json({ message: "Server Error updating supplier" });
    }
};

// 📌 DELETE SUPPLIER
exports.deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;

        // IMPORTANT: Check if this supplier is associated with any PurchaseOrders or ImportReceipts
        // As the schema doesn't enforce relation constraints from Supplier -> PO/Import,
        // we should check manually to prevent orphaned records.
        const relatedPOs = await prisma.purchaseOrder.findFirst({
            where: { supplierId: Number(id) }
        });
        const relatedImports = await prisma.importReceipt.findFirst({
            where: { supplierId: Number(id) }
        });

        if (relatedPOs || relatedImports) {
            return res.status(400).json({ message: "Cannot delete supplier associated with existing purchase orders or import receipts." });
        }

        await prisma.supplier.delete({
            where: { id: Number(id) }
        });

        res.json({ message: "Supplier deleted successfully" });
    } catch (error) {
        if (error.code === 'P2025') { // Prisma code for record not found for delete
            return res.status(404).json({ message: "Supplier not found" });
        }
        console.error("Error deleting supplier:", error);
        res.status(500).json({ message: "Server Error deleting supplier" });
    }
}; 