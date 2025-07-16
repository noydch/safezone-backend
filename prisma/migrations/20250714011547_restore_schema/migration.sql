/*
  Warnings:

  - You are about to drop the column `baseUnitId` on the `foods` table. All the data in the column will be lost.
  - You are about to drop the column `qty` on the `foods` table. All the data in the column will be lost.
  - You are about to drop the column `foodId` on the `import_details` table. All the data in the column will be lost.
  - You are about to drop the column `foodId` on the `product_units` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `foods` DROP FOREIGN KEY `foods_baseUnitId_fkey`;

-- DropForeignKey
ALTER TABLE `import_details` DROP FOREIGN KEY `import_details_foodId_fkey`;

-- DropForeignKey
ALTER TABLE `product_units` DROP FOREIGN KEY `product_units_foodId_fkey`;

-- DropIndex
DROP INDEX `foods_baseUnitId_fkey` ON `foods`;

-- DropIndex
DROP INDEX `import_details_foodId_fkey` ON `import_details`;

-- DropIndex
DROP INDEX `product_units_foodId_fkey` ON `product_units`;

-- AlterTable
ALTER TABLE `foods` DROP COLUMN `baseUnitId`,
    DROP COLUMN `qty`;

-- AlterTable
ALTER TABLE `import_details` DROP COLUMN `foodId`;

-- AlterTable
ALTER TABLE `product_units` DROP COLUMN `foodId`;
