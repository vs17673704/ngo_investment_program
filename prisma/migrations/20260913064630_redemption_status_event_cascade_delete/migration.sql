-- DropForeignKey
ALTER TABLE "RedemptionStatusEvent" DROP CONSTRAINT "RedemptionStatusEvent_redemptionRequestId_fkey";

-- AddForeignKey
ALTER TABLE "RedemptionStatusEvent" ADD CONSTRAINT "RedemptionStatusEvent_redemptionRequestId_fkey" FOREIGN KEY ("redemptionRequestId") REFERENCES "RedemptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
