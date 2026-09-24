-- CreateTable
CREATE TABLE "RedemptionStatusEvent" (
    "id" TEXT NOT NULL,
    "redemptionRequestId" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedemptionStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedemptionStatusEvent_redemptionRequestId_idx" ON "RedemptionStatusEvent"("redemptionRequestId");

-- AddForeignKey
ALTER TABLE "RedemptionStatusEvent" ADD CONSTRAINT "RedemptionStatusEvent_redemptionRequestId_fkey" FOREIGN KEY ("redemptionRequestId") REFERENCES "RedemptionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
