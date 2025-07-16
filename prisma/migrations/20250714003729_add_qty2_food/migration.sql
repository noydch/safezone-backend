/*
  Warnings:

  - The values [CANCELLED] on the enum `orders_billStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `foods` ADD COLUMN `qty` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `orders` MODIFY `billStatus` ENUM('OPEN', 'PAID') NOT NULL DEFAULT 'OPEN';
