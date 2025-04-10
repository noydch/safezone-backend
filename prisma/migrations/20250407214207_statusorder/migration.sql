-- DropForeignKey
ALTER TABLE `OrderDetail` DROP FOREIGN KEY `OrderDetail_ord_id_fkey`;

-- DropIndex
DROP INDEX `OrderDetail_ord_id_fkey` ON `OrderDetail`;

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `status` ENUM('PENDING', 'COOKING', 'READY', 'SERVED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `updatedAt` DATETIME(3) NULL;

-- AddForeignKey
ALTER TABLE `OrderDetail` ADD CONSTRAINT `OrderDetail_ord_id_fkey` FOREIGN KEY (`ord_id`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
