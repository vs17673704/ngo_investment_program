-- Design.md 3.11 [BRD-required]: Reinvestment target-plan selection.
-- Design.md 3.13 [BRD-required]: Gadgets & Accessories multi-select cart.

-- AlterTable: add the reinvestment target plan column first (nullable, safe).
ALTER TABLE "RedemptionRequest" ADD COLUMN     "targetPlanId" TEXT;

-- CreateTable: one cart line per gadget/quantity selected in a GADGETS request.
CREATE TABLE "RedemptionGadgetItem" (
    "id" TEXT NOT NULL,
    "redemptionRequestId" TEXT NOT NULL,
    "gadgetItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceAtRequest" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedemptionGadgetItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RedemptionGadgetItem_redemptionRequestId_idx" ON "RedemptionGadgetItem"("redemptionRequestId");

CREATE INDEX "RedemptionGadgetItem_gadgetItemId_idx" ON "RedemptionGadgetItem"("gadgetItemId");

-- DataMigration: backfill any existing single-item GADGETS requests (created
-- before the cart model existed) into one RedemptionGadgetItem cart line each,
-- so no historical request loses its gadget association when the old
-- "relatedGadgetItemId" column is dropped below.
INSERT INTO "RedemptionGadgetItem" ("id", "redemptionRequestId", "gadgetItemId", "quantity", "priceAtRequest", "createdAt")
SELECT
    'legacy-' || rr."id",
    rr."id",
    rr."relatedGadgetItemId",
    1,
    COALESCE(g."price", rr."requestedAmount"),
    rr."createdAt"
FROM "RedemptionRequest" rr
LEFT JOIN "GadgetItem" g ON g."id" = rr."relatedGadgetItemId"
WHERE rr."relatedGadgetItemId" IS NOT NULL;

-- AlterTable: now safe to drop the superseded single-item column.
ALTER TABLE "RedemptionRequest" DROP COLUMN "relatedGadgetItemId";

-- AddForeignKey
ALTER TABLE "RedemptionRequest" ADD CONSTRAINT "RedemptionRequest_targetPlanId_fkey" FOREIGN KEY ("targetPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionGadgetItem" ADD CONSTRAINT "RedemptionGadgetItem_redemptionRequestId_fkey" FOREIGN KEY ("redemptionRequestId") REFERENCES "RedemptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionGadgetItem" ADD CONSTRAINT "RedemptionGadgetItem_gadgetItemId_fkey" FOREIGN KEY ("gadgetItemId") REFERENCES "GadgetItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
