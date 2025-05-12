/*
  Warnings:

  - The values [Admin,Salesman] on the enum `Employee_role` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `Employee` MODIFY `role` ENUM('Owner', 'Manager', 'Cashier', 'Chef', 'Waiter') NOT NULL;
