/*
  Warnings:

  - Made the column `categoryId` on table `drinks` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `drinks` DROP FOREIGN KEY `drinks_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `orders` DROP FOREIGN KEY `orders_tableId_fkey`;

-- DropIndex
DROP INDEX `drinks_categoryId_fkey` ON `drinks`;

-- DropIndex
DROP INDEX `orders_tableId_fkey` ON `orders`;

-- AlterTable
ALTER TABLE `drinks` MODIFY `categoryId` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `drinks` ADD CONSTRAINT `drinks_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `tables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
