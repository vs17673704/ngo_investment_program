-- AlterTable
ALTER TABLE "UserPlan" ADD COLUMN     "preferredPaymentMethod" "PaymentMethod" NOT NULL DEFAULT 'UPI';
