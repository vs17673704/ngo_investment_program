-- CreateEnum
CREATE TYPE "CadenceUnit" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "paymentCadences" JSONB NOT NULL DEFAULT '[{"unit":"MONTH","interval":1}]';

-- AlterTable
ALTER TABLE "UserPlan" ADD COLUMN     "cadenceInterval" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "cadenceUnit" "CadenceUnit" NOT NULL DEFAULT 'MONTH';
