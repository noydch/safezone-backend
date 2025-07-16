/*
  Warnings:

  - Added the required column `baseUnitId` to the `foods` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `foods` ADD COLUMN `baseUnitId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `import_details` ADD COLUMN `foodId` INTEGER NULL;

-- AlterTable
ALTER TABLE `product_units` ADD COLUMN `foodId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `product_units` ADD CONSTRAINT `product_units_foodId_fkey` FOREIGN KEY (`foodId`) REFERENCES `foods`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `foods` ADD CONSTRAINT `foods_baseUnitId_fkey` FOREIGN KEY (`baseUnitId`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_details` ADD CONSTRAINT `import_details_foodId_fkey` FOREIGN KEY (`foodId`) REFERENCES `foods`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
