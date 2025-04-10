-- AlterTable
ALTER TABLE `ImportReceipt` ADD COLUMN `purchaseOrderId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `ImportReceipt` ADD CONSTRAINT `ImportReceipt_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportReceipt` ADD CONSTRAINT `ImportReceipt_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
