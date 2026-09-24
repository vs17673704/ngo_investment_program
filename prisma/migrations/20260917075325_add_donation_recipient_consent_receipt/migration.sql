-- AlterTable
ALTER TABLE "RedemptionRequest" ADD COLUMN     "consentGiven" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "consentGivenAt" TIMESTAMP(3),
ADD COLUMN     "donationRecipientId" TEXT,
ADD COLUMN     "donationReference" TEXT,
ADD COLUMN     "receiptGeneratedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DonationRecipient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DonationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DonationRecipient_name_key" ON "DonationRecipient"("name");

-- AddForeignKey
ALTER TABLE "RedemptionRequest" ADD CONSTRAINT "RedemptionRequest_donationRecipientId_fkey" FOREIGN KEY ("donationRecipientId") REFERENCES "DonationRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
