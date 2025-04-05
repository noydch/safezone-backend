/*
  Warnings:

  - You are about to alter the column `role` on the `employee` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(1))`.

*/
-- AlterTable
ALTER TABLE `employee` MODIFY `role` ENUM('Admin', 'Salesman', 'Chef', 'Waiter') NOT NULL;
