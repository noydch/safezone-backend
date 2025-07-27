/*
  Warnings:

  - The values [Owner] on the enum `employees_role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `employees` MODIFY `role` ENUM('Admin', 'Manager', 'Cashier', 'Chef', 'Waiter') NOT NULL;

-- AlterTable
ALTER TABLE `table` ALTER COLUMN `updatedAt` DROP DEFAULT;
