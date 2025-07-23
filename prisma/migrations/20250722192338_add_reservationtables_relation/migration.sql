/*
  Warnings:

  - You are about to drop the column `tableId` on the `reservations` table. All the data in the column will be lost.
  - You are about to drop the `tables` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `orders` DROP FOREIGN KEY `orders_tableId_fkey`;

-- DropForeignKey
ALTER TABLE `reservations` DROP FOREIGN KEY `reservations_tableId_fkey`;

-- DropForeignKey
ALTER TABLE `tables` DROP FOREIGN KEY `tables_groupId_fkey`;

-- DropIndex
DROP INDEX `orders_tableId_fkey` ON `orders`;

-- DropIndex
DROP INDEX `reservations_tableId_fkey` ON `reservations`;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `tableGroupId` INTEGER NULL;

-- AlterTable
ALTER TABLE `reservations` DROP COLUMN `tableId`;

-- DropTable
DROP TABLE `tables`;

-- CreateTable
CREATE TABLE `Table` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `table_number` INTEGER NOT NULL,
    `seat` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `groupId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservation_tables` (
    `reservationId` INTEGER NOT NULL,
    `tableId` INTEGER NOT NULL,

    PRIMARY KEY (`reservationId`, `tableId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Table` ADD CONSTRAINT `Table_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `TableGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_tables` ADD CONSTRAINT `reservation_tables_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `reservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation_tables` ADD CONSTRAINT `reservation_tables_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `Table`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `Table`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_tableGroupId_fkey` FOREIGN KEY (`tableGroupId`) REFERENCES `TableGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
