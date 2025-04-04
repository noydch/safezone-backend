-- DropForeignKey
ALTER TABLE `importreceipt` DROP FOREIGN KEY `ImportReceipt_supplierId_fkey`;

-- DropForeignKey
ALTER TABLE `purchaseorder` DROP FOREIGN KEY `PurchaseOrder_supplierId_fkey`;

-- DropIndex
DROP INDEX `ImportReceipt_supplierId_fkey` ON `importreceipt`;

-- DropIndex
DROP INDEX `PurchaseOrder_supplierId_fkey` ON `purchaseorder`;
