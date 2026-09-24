-- CreateEnum
CREATE TYPE "GeneralEnquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "GeneralEnquiry" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "status" "GeneralEnquiryStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'CONTACT_PAGE',
    "ipAddress" TEXT,
    "adminComment" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneralEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneralEnquiry_userId_idx" ON "GeneralEnquiry"("userId");

-- CreateIndex
CREATE INDEX "GeneralEnquiry_status_idx" ON "GeneralEnquiry"("status");

-- CreateIndex
CREATE INDEX "GeneralEnquiry_email_idx" ON "GeneralEnquiry"("email");

-- AddForeignKey
ALTER TABLE "GeneralEnquiry" ADD CONSTRAINT "GeneralEnquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneralEnquiry" ADD CONSTRAINT "GeneralEnquiry_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
