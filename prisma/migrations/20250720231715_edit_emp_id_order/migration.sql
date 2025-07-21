-- DropForeignKey
ALTER TABLE `orders` DROP FOREIGN KEY `orders_empId_fkey`;

-- DropIndex
DROP INDEX `orders_empId_fkey` ON `orders`;

-- AlterTable
ALTER TABLE `orders` MODIFY `empId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_empId_fkey` FOREIGN KEY (`empId`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
