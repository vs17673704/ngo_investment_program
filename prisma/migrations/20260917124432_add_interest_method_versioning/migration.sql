-- BRD Interest Calculation Method rule (e): editing a method never mutates
-- an existing row — an edit creates a new row and retires the old one via
-- `active`, so already-enrolled Plans/UserPlans keep their FK to an
-- immutable snapshot.

-- AlterTable
ALTER TABLE "InterestCalculationMethod" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "previousVersionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InterestCalculationMethod_previousVersionId_key" ON "InterestCalculationMethod"("previousVersionId");

-- AddForeignKey
ALTER TABLE "InterestCalculationMethod" ADD CONSTRAINT "InterestCalculationMethod_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "InterestCalculationMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
