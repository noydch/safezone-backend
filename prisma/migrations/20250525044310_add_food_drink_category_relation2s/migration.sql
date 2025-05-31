-- DropForeignKey
ALTER TABLE `drinks` DROP FOREIGN KEY `drinks_categoryId_fkey`;

-- DropIndex
DROP INDEX `drinks_categoryId_fkey` ON `drinks`;

-- AlterTable
ALTER TABLE `drinks` MODIFY `categoryId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `drinks` ADD CONSTRAINT `drinks_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
