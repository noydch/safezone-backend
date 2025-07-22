/*
  Warnings:

  - Added the required column `itemType` to the `order_details` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `order_details` ADD COLUMN `cancelReason` VARCHAR(191) NULL,
    ADD COLUMN `itemType` ENUM('FOOD', 'DRINK') NOT NULL,
    ADD COLUMN `status` ENUM('WAITING', 'COOKING', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'WAITING';
