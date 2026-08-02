-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "maintenance_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "maintenance_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
