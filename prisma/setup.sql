-- =============================================================================
-- Referral & Reward Program — complete PostgreSQL setup script
--
-- Creates the entire schema (35 tables, 20 enums, indexes, foreign keys — the
-- exact DDL Prisma generates from prisma/schema.prisma) and loads sample data.
--
-- USAGE (run against an EMPTY database; the whole script is one transaction, so
-- a failure leaves nothing behind):
--
--   createdb referral_rewards
--   psql -d referral_rewards -v ON_ERROR_STOP=1 -f prisma/setup.sql
--
-- To start over, drop and recreate the database (or uncomment the next line
-- — this DELETES EVERYTHING in the public schema):
--   -- DROP SCHEMA public CASCADE; CREATE SCHEMA public;
--
-- DEMO LOGINS (passwords are bcrypt-hashed below)
--   admin@demo.local          / Admin@1234   (role ADMIN)
--   user@demo.local           / User@1234    (has a matured plan, an active plan,
--                                             commission, pending refund request)
--   priya.sharma@demo.local   / User@1234    (referred by the demo user; one
--                                             payment RETRYING; gadget request
--                                             awaiting shortfall resolution)
--   rahul.verma@demo.local    / User@1234    (lumpsum plan; accrued commission
--                                             pending approval; rejected request)
--   neha.gupta@demo.local     / User@1234    (locked account — cannot log in)
-- Login 2FA codes in this demo build are fixed: 000000 for admins, 111111 for
-- everyone else (see src/lib/auth/otp.ts).
--
-- Sample timestamps are relative to the moment the script runs (UTC).
-- This script does not create Prisma's _prisma_migrations table. If you later
-- want to use "prisma migrate", baseline first:
--   npx prisma migrate resolve --applied <each folder name in prisma/migrations>
-- Tables not pre-filled because they hold runtime state: OtpCode, RefreshToken,
-- PushSubscription, ThemeConfig (the app falls back to its default theme).
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1 — SCHEMA
-- =============================================================================

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('MONTHLY', 'LUMPSUM');

-- CreateEnum
CREATE TYPE "CadenceUnit" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "InterestFormulaType" AS ENUM ('SIMPLE', 'COMPOUND', 'CUSTOM');

-- CreateEnum
CREATE TYPE "UserPlanStatus" AS ENUM ('ACTIVE', 'MATURED', 'DISCONTINUED', 'PARTIALLY_REDEEMED', 'REDEEMED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'UPI', 'NETBANKING', 'WALLET');

-- CreateEnum
CREATE TYPE "MandateStatus" AS ENUM ('CREATED', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('PLAN_PAYMENT', 'INTEREST', 'COMMISSION', 'REDEMPTION_COURSE', 'REDEMPTION_REFUND', 'REDEMPTION_REINVESTMENT', 'REDEMPTION_DONATION', 'REDEMPTION_FRANCHISEE', 'REDEMPTION_GADGETS');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('RECURRING', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('ACCRUED', 'APPROVED', 'CREDITED', 'AVAILABLE_FOR_WITHDRAWAL', 'WITHDRAWN', 'NOT_ACCRUED');

-- CreateEnum
CREATE TYPE "RedemptionCategory" AS ENUM ('COURSE', 'REFUND', 'REINVESTMENT', 'DONATION', 'FRANCHISEE', 'GADGETS');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'AWAITING_SHORTFALL_RESOLUTION', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REGISTRATION', 'PAYMENT_SUCCESS', 'PAYMENT_FAILURE', 'PLAN_MATURITY', 'REFERRAL_EARNED', 'REFUND_PROCESSED', 'ADMIN_MESSAGE', 'PROMOTIONAL', 'INSTALMENT_REMINDER', 'GENERAL_ENQUIRY_RECEIVED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "LoginResult" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "GeneralEnquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ThemeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "mobileNumber" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "referralCode" TEXT NOT NULL,
    "referralCodeActive" BOOLEAN NOT NULL DEFAULT true,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rewardPointsBalance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenHash" TEXT,
    "remembered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "platform" TEXT,
    "userAgent" TEXT,
    "lastError" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "result" "LoginResult" NOT NULL DEFAULT 'SUCCESS',
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoutAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestCalculationMethod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formulaType" "InterestFormulaType" NOT NULL,
    "ratePercent" DECIMAL(6,2) NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "compoundingFrequency" TEXT,
    "customFormula" TEXT,
    "dayCountBasis" TEXT NOT NULL DEFAULT 'ACTUAL_365',
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "previousVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterestCalculationMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "paymentFrequency" "PaymentFrequency" NOT NULL,
    "presetAmounts" DECIMAL(12,2)[],
    "paymentCadences" JSONB NOT NULL DEFAULT '[{"unit":"MONTH","interval":1}]',
    "interestMethodId" TEXT NOT NULL,
    "rewardPercent" DECIMAL(5,2),
    "commissionPercent" DECIMAL(5,2) NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "interestMethodId" TEXT NOT NULL,
    "interestMethodVersion" INTEGER NOT NULL,
    "rewardPercentSnapshot" DECIMAL(5,2),
    "commissionPercentSnapshot" DECIMAL(5,2) NOT NULL,
    "paymentAmount" DECIMAL(12,2) NOT NULL,
    "paymentFrequency" "PaymentFrequency" NOT NULL,
    "cadenceUnit" "CadenceUnit" NOT NULL DEFAULT 'MONTH',
    "cadenceInterval" INTEGER NOT NULL DEFAULT 1,
    "preferredPaymentMethod" "PaymentMethod" NOT NULL DEFAULT 'UPI',
    "status" "UserPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "principalPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remainingUnpaidPrincipal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMandate" (
    "id" TEXT NOT NULL,
    "userPlanId" TEXT NOT NULL,
    "gatewayMandateId" TEXT NOT NULL,
    "status" "MandateStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userPlanId" TEXT NOT NULL,
    "mandateId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "gatewayOrderId" TEXT NOT NULL,
    "gatewayPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'UPI',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "actualDate" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "manualWindowEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "gatewayEventId" TEXT NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userPlanId" TEXT,
    "paymentId" TEXT,
    "transactionType" "LedgerTransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceBefore" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "referrerUserId" TEXT,
    "commissionId" TEXT,
    "approverUserId" TEXT,
    "approvalTimestamp" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "interestMethodId" TEXT,
    "interestMethodVersion" INTEGER,
    "transactionTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referralCodeUsed" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "cancellationReason" TEXT,
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "userPlanId" TEXT,
    "paymentId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'ACCRUED',
    "commissionType" "CommissionType" NOT NULL,
    "cyclePosition" INTEGER,
    "accrualDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalDate" TIMESTAMP(3),
    "creditDate" TIMESTAMP(3),
    "withdrawalDate" TIMESTAMP(3),

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationRecipient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DonationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GadgetItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "stockQuantity" INTEGER NOT NULL,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GadgetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "College" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "College_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FranchiseePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "oneTimeDeductiblePrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "FranchiseePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FranchiseePlanCollegeMapping" (
    "franchiseePlanId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,

    CONSTRAINT "FranchiseePlanCollegeMapping_pkey" PRIMARY KEY ("franchiseePlanId","collegeId")
);

-- CreateTable
CREATE TABLE "FranchiseeRedemptionEnquiry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "franchiseePlanId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAmount" DECIMAL(12,2) NOT NULL,
    "availableMarginAtRequest" DECIMAL(14,2) NOT NULL,
    "shortfallAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shortfallReference" TEXT,
    "shortfallVerifiedBy" TEXT,
    "shortfallVerifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FranchiseeRedemptionEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedemptionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "RedemptionCategory" NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAmount" DECIMAL(12,2) NOT NULL,
    "availableMarginAtRequest" DECIMAL(14,2) NOT NULL,
    "shortfallAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reservedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shortfallReference" TEXT,
    "shortfallVerifiedBy" TEXT,
    "shortfallVerifiedAt" TIMESTAMP(3),
    "relatedCourseId" TEXT,
    "rewardPointsApplied" INTEGER NOT NULL DEFAULT 0,
    "targetPlanId" TEXT,
    "donationRecipientId" TEXT,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentGivenAt" TIMESTAMP(3),
    "donationReference" TEXT,
    "receiptGeneratedAt" TIMESTAMP(3),
    "comments" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedemptionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedemptionGadgetItem" (
    "id" TEXT NOT NULL,
    "redemptionRequestId" TEXT NOT NULL,
    "gadgetItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceAtRequest" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedemptionGadgetItem_pkey" PRIMARY KEY ("id")
);

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
    "anonymizedAt" TIMESTAMP(3),

    CONSTRAINT "GeneralEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AboutUsSectionDraft" (
    "id" TEXT NOT NULL,
    "heading" TEXT,
    "body" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AboutUsSectionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AboutUsSectionPublished" (
    "id" TEXT NOT NULL,
    "heading" TEXT,
    "body" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AboutUsSectionPublished_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactUsContent" (
    "id" TEXT NOT NULL,
    "draftAddress" TEXT,
    "draftPhone" TEXT,
    "draftEmail" TEXT,
    "draftWebsite" TEXT,
    "draftSocialLinks" JSONB,
    "publishedAddress" TEXT,
    "publishedPhone" TEXT,
    "publishedEmail" TEXT,
    "publishedWebsite" TEXT,
    "publishedSocialLinks" JSONB,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactUsContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "relatedEntityRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "relatedEntityRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityRef" TEXT,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeConfig" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ThemeStatus" NOT NULL,
    "appName" TEXT,
    "logoUrl" TEXT,
    "loginLogoUrl" TEXT,
    "faviconUrl" TEXT,
    "loginTitle" TEXT,
    "loginSubtitle" TEXT,
    "welcomeText" TEXT,
    "primaryButtonLabel" TEXT,
    "supportText" TEXT,
    "footerText" TEXT,
    "loginBackgroundType" TEXT NOT NULL DEFAULT 'SOLID',
    "loginBackgroundUrl" TEXT,
    "loginBackgroundPosition" TEXT NOT NULL DEFAULT 'CENTER',
    "loginBackgroundSize" TEXT NOT NULL DEFAULT 'COVER',
    "loginOverlayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "loginOverlayColor" TEXT NOT NULL DEFAULT '#000000',
    "loginOverlayOpacity" INTEGER NOT NULL DEFAULT 40,
    "primaryColor" TEXT NOT NULL DEFAULT '#000000',
    "onPrimaryColor" TEXT NOT NULL DEFAULT '#ffffff',
    "secondaryColor" TEXT NOT NULL DEFAULT '#006c4a',
    "onSecondaryColor" TEXT NOT NULL DEFAULT '#ffffff',
    "backgroundColor" TEXT NOT NULL DEFAULT '#fbf8fc',
    "surfaceColor" TEXT NOT NULL DEFAULT '#f0edf1',
    "cardColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textPrimaryColor" TEXT NOT NULL DEFAULT '#1b1b1e',
    "textSecondaryColor" TEXT NOT NULL DEFAULT '#47464a',
    "successColor" TEXT NOT NULL DEFAULT '#006c4a',
    "warningColor" TEXT NOT NULL DEFAULT '#c76c00',
    "errorColor" TEXT NOT NULL DEFAULT '#ba1a1a',
    "infoColor" TEXT NOT NULL DEFAULT '#0b57d0',
    "borderColor" TEXT NOT NULL DEFAULT '#c8c5ca',
    "fontFamily" TEXT NOT NULL DEFAULT 'inter',
    "headingFontFamily" TEXT NOT NULL DEFAULT 'jakarta',
    "baseFontSize" INTEGER NOT NULL DEFAULT 16,
    "borderRadiusPreset" TEXT NOT NULL DEFAULT 'standard',
    "themeMode" TEXT NOT NULL DEFAULT 'LIGHT',
    "createdBy" TEXT,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ThemeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referralCode_idx" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_provider_providerAccountId_key" ON "SocialAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_fcmToken_key" ON "PushSubscription"("fcmToken");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "OtpCode_userId_purpose_idx" ON "OtpCode"("userId", "purpose");

-- CreateIndex
CREATE INDEX "LoginHistory_userId_idx" ON "LoginHistory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InterestCalculationMethod_previousVersionId_key" ON "InterestCalculationMethod"("previousVersionId");

-- CreateIndex
CREATE INDEX "UserPlan_userId_idx" ON "UserPlan"("userId");

-- CreateIndex
CREATE INDEX "UserPlan_planId_idx" ON "UserPlan"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMandate_gatewayMandateId_key" ON "PaymentMandate"("gatewayMandateId");

-- CreateIndex
CREATE INDEX "PaymentMandate_userPlanId_idx" ON "PaymentMandate"("userPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayOrderId_key" ON "Payment"("gatewayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayPaymentId_key" ON "Payment"("gatewayPaymentId");

-- CreateIndex
CREATE INDEX "Payment_userPlanId_idx" ON "Payment"("userPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_gatewayEventId_key" ON "PaymentEvent"("gatewayEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_idx" ON "LedgerEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "Referral_referrerUserId_idx" ON "Referral"("referrerUserId");

-- CreateIndex
CREATE INDEX "Commission_referralId_idx" ON "Commission"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "University_name_key" ON "University"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DonationRecipient_name_key" ON "DonationRecipient"("name");

-- CreateIndex
CREATE INDEX "Course_universityId_idx" ON "Course"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "College_name_key" ON "College"("name");

-- CreateIndex
CREATE INDEX "FranchiseeRedemptionEnquiry_userId_idx" ON "FranchiseeRedemptionEnquiry"("userId");

-- CreateIndex
CREATE INDEX "RedemptionRequest_userId_idx" ON "RedemptionRequest"("userId");

-- CreateIndex
CREATE INDEX "RedemptionGadgetItem_redemptionRequestId_idx" ON "RedemptionGadgetItem"("redemptionRequestId");

-- CreateIndex
CREATE INDEX "RedemptionGadgetItem_gadgetItemId_idx" ON "RedemptionGadgetItem"("gadgetItemId");

-- CreateIndex
CREATE INDEX "RedemptionStatusEvent_redemptionRequestId_idx" ON "RedemptionStatusEvent"("redemptionRequestId");

-- CreateIndex
CREATE INDEX "GeneralEnquiry_userId_idx" ON "GeneralEnquiry"("userId");

-- CreateIndex
CREATE INDEX "GeneralEnquiry_status_idx" ON "GeneralEnquiry"("status");

-- CreateIndex
CREATE INDEX "GeneralEnquiry_email_idx" ON "GeneralEnquiry"("email");

-- CreateIndex
CREATE INDEX "AboutUsSectionDraft_order_idx" ON "AboutUsSectionDraft"("order");

-- CreateIndex
CREATE INDEX "AboutUsSectionPublished_order_idx" ON "AboutUsSectionPublished"("order");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "EmailMessage_recipient_idx" ON "EmailMessage"("recipient");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_eventType_idx" ON "AuditLog"("eventType");

-- CreateIndex
CREATE INDEX "ThemeConfig_status_idx" ON "ThemeConfig"("status");

-- CreateIndex
CREATE INDEX "ThemeConfig_version_idx" ON "ThemeConfig"("version");

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestCalculationMethod" ADD CONSTRAINT "InterestCalculationMethod_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "InterestCalculationMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_interestMethodId_fkey" FOREIGN KEY ("interestMethodId") REFERENCES "InterestCalculationMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlan" ADD CONSTRAINT "UserPlan_interestMethodId_fkey" FOREIGN KEY ("interestMethodId") REFERENCES "InterestCalculationMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMandate" ADD CONSTRAINT "PaymentMandate_userPlanId_fkey" FOREIGN KEY ("userPlanId") REFERENCES "UserPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userPlanId_fkey" FOREIGN KEY ("userPlanId") REFERENCES "UserPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "PaymentMandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userPlanId_fkey" FOREIGN KEY ("userPlanId") REFERENCES "UserPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_userPlanId_fkey" FOREIGN KEY ("userPlanId") REFERENCES "UserPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseePlanCollegeMapping" ADD CONSTRAINT "FranchiseePlanCollegeMapping_franchiseePlanId_fkey" FOREIGN KEY ("franchiseePlanId") REFERENCES "FranchiseePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseePlanCollegeMapping" ADD CONSTRAINT "FranchiseePlanCollegeMapping_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseeRedemptionEnquiry" ADD CONSTRAINT "FranchiseeRedemptionEnquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseeRedemptionEnquiry" ADD CONSTRAINT "FranchiseeRedemptionEnquiry_franchiseePlanId_fkey" FOREIGN KEY ("franchiseePlanId") REFERENCES "FranchiseePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseeRedemptionEnquiry" ADD CONSTRAINT "FranchiseeRedemptionEnquiry_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionRequest" ADD CONSTRAINT "RedemptionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionRequest" ADD CONSTRAINT "RedemptionRequest_targetPlanId_fkey" FOREIGN KEY ("targetPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionRequest" ADD CONSTRAINT "RedemptionRequest_donationRecipientId_fkey" FOREIGN KEY ("donationRecipientId") REFERENCES "DonationRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionGadgetItem" ADD CONSTRAINT "RedemptionGadgetItem_redemptionRequestId_fkey" FOREIGN KEY ("redemptionRequestId") REFERENCES "RedemptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionGadgetItem" ADD CONSTRAINT "RedemptionGadgetItem_gadgetItemId_fkey" FOREIGN KEY ("gadgetItemId") REFERENCES "GadgetItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionStatusEvent" ADD CONSTRAINT "RedemptionStatusEvent_redemptionRequestId_fkey" FOREIGN KEY ("redemptionRequestId") REFERENCES "RedemptionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneralEnquiry" ADD CONSTRAINT "GeneralEnquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneralEnquiry" ADD CONSTRAINT "GeneralEnquiry_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeConfig" ADD CONSTRAINT "ThemeConfig_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeConfig" ADD CONSTRAINT "ThemeConfig_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- PART 2 — SAMPLE DATA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Users (demo accounts: admin@demo.local / Admin@1234, user@demo.local / User@1234)
-- ---------------------------------------------------------------------------

INSERT INTO "User" ("id", "email", "passwordHash", "mobileNumber", "role", "referralCode", "referralCodeActive", "isEmailVerified", "failedLoginCount", "lockedUntil", "pushNotificationsEnabled", "rewardPointsBalance", "createdAt", "updatedAt") VALUES
  ('usr-admin', 'admin@demo.local', '$2b$10$7wI0Tc5rfBIQapzef07Sd.3DDT56bief4n9GQ3YhbWvhyNxEj4glK', '+919800000000', 'ADMIN', 'ADMIN001', TRUE, TRUE, 0, NULL, TRUE, 0, ((now() at time zone 'utc') - interval '9600 hours'), ((now() at time zone 'utc') - interval '24 hours')),
  ('usr-demo', 'user@demo.local', '$2b$10$CtAnGpK0c6tZD6kKtUyyze0cm2Iyv7l7YTOh8BnPzVKq4qqJokzWm', '+919800000001', 'USER', 'USER0001', TRUE, TRUE, 0, NULL, TRUE, 300, ((now() at time zone 'utc') - interval '6720 hours'), ((now() at time zone 'utc') - interval '24 hours')),
  ('usr-priya', 'priya.sharma@demo.local', '$2b$10$CtAnGpK0c6tZD6kKtUyyze0cm2Iyv7l7YTOh8BnPzVKq4qqJokzWm', '+919800000002', 'USER', 'PRIYA001', TRUE, TRUE, 0, NULL, TRUE, 0, ((now() at time zone 'utc') - interval '1488 hours'), ((now() at time zone 'utc') - interval '24 hours')),
  ('usr-rahul', 'rahul.verma@demo.local', '$2b$10$CtAnGpK0c6tZD6kKtUyyze0cm2Iyv7l7YTOh8BnPzVKq4qqJokzWm', '+919800000003', 'USER', 'RAHUL001', TRUE, TRUE, 0, NULL, FALSE, 0, ((now() at time zone 'utc') - interval '648 hours'), ((now() at time zone 'utc') - interval '24 hours')),
  ('usr-neha', 'neha.gupta@demo.local', '$2b$10$CtAnGpK0c6tZD6kKtUyyze0cm2Iyv7l7YTOh8BnPzVKq4qqJokzWm', NULL, 'USER', 'NEHA0001', TRUE, FALSE, 5, '2099-12-31', TRUE, 0, ((now() at time zone 'utc') - interval '480 hours'), ((now() at time zone 'utc') - interval '96 hours'));

INSERT INTO "SocialAccount" ("id", "userId", "provider", "providerAccountId", "createdAt") VALUES
  ('soc-priya-google', 'usr-priya', 'google', 'google-sample-1001', ((now() at time zone 'utc') - interval '1488 hours'));


-- ---------------------------------------------------------------------------
-- Interest calculation methods
-- ---------------------------------------------------------------------------

INSERT INTO "InterestCalculationMethod" ("id", "name", "formulaType", "ratePercent", "tenureMonths", "compoundingFrequency", "customFormula", "dayCountBasis", "version", "active", "previousVersionId", "createdAt") VALUES
  ('seed-simple-12', 'Simple 12% p.a.', 'SIMPLE', 12, 12, NULL, NULL, 'ACTUAL_365', 1, TRUE, NULL, ((now() at time zone 'utc') - interval '9600 hours')),
  ('seed-compound-10', 'Compound 10% p.a. (quarterly)', 'COMPOUND', 10, 24, 'QUARTERLY', NULL, 'ACTUAL_365', 1, TRUE, NULL, ((now() at time zone 'utc') - interval '9600 hours')),
  ('sample-simple-6', 'Simple 12% p.a. (6-month)', 'SIMPLE', 12, 6, NULL, NULL, 'ACTUAL_365', 1, TRUE, NULL, ((now() at time zone 'utc') - interval '7200 hours')),
  ('sample-custom-8', 'Custom 8% flat formula', 'CUSTOM', 8, 12, NULL, 'Principal * (Rate / 100) * Tenure', 'ACTUAL_365', 1, TRUE, NULL, ((now() at time zone 'utc') - interval '4800 hours'));


-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------

INSERT INTO "Plan" ("id", "name", "tenureMonths", "paymentFrequency", "presetAmounts", "paymentCadences", "interestMethodId", "rewardPercent", "commissionPercent", "status", "configVersion", "createdAt", "updatedAt") VALUES
  ('seed-plan-basic', 'Basic Growth Plan', 12, 'MONTHLY', ARRAY[1000,2000,5000]::DECIMAL(12,2)[], '[{"unit":"MONTH","interval":1},{"unit":"MONTH","interval":3}]'::jsonb, 'seed-simple-12', 2, 5, 'ACTIVE', 1, ((now() at time zone 'utc') - interval '9600 hours'), ((now() at time zone 'utc') - interval '9600 hours')),
  ('seed-plan-growth', 'Premium Growth Plan', 24, 'MONTHLY', ARRAY[5000,10000,25000]::DECIMAL(12,2)[], '[{"unit":"MONTH","interval":1}]'::jsonb, 'seed-compound-10', 3, 7, 'ACTIVE', 1, ((now() at time zone 'utc') - interval '9600 hours'), ((now() at time zone 'utc') - interval '9600 hours')),
  ('sample-plan-lumpsum', 'Lumpsum Saver Plan', 12, 'LUMPSUM', ARRAY[10000,25000,50000]::DECIMAL(12,2)[], '[{"unit":"MONTH","interval":1}]'::jsonb, 'sample-custom-8', 2.5, 4, 'ACTIVE', 1, ((now() at time zone 'utc') - interval '4800 hours'), ((now() at time zone 'utc') - interval '4800 hours')),
  ('sample-plan-legacy', 'Legacy Saver Plan', 6, 'MONTHLY', ARRAY[500,1000]::DECIMAL(12,2)[], '[{"unit":"MONTH","interval":1}]'::jsonb, 'sample-simple-6', 1, 3, 'DISCONTINUED', 2, ((now() at time zone 'utc') - interval '7200 hours'), ((now() at time zone 'utc') - interval '2400 hours'));


-- ---------------------------------------------------------------------------
-- User plans (snapshots of method/version/percentages at subscribe time)
-- ---------------------------------------------------------------------------

INSERT INTO "UserPlan" ("id", "userId", "planId", "interestMethodId", "interestMethodVersion", "rewardPercentSnapshot", "commissionPercentSnapshot", "paymentAmount", "paymentFrequency", "cadenceUnit", "cadenceInterval", "preferredPaymentMethod", "status", "principalPaid", "remainingUnpaidPrincipal", "startDate", "maturityDate", "createdAt", "updatedAt") VALUES
  ('up-demo-legacy', 'usr-demo', 'sample-plan-legacy', 'sample-simple-6', 1, 1, 3, 1000, 'MONTHLY', 'MONTH', 1, 'UPI', 'MATURED', 6000, 0, ((now() at time zone 'utc') - interval '6480 hours'), ((now() at time zone 'utc') - interval '2160 hours'), ((now() at time zone 'utc') - interval '6480 hours'), ((now() at time zone 'utc') - interval '2160 hours')),
  ('up-demo-basic', 'usr-demo', 'seed-plan-basic', 'seed-simple-12', 1, 2, 5, 1000, 'MONTHLY', 'MONTH', 1, 'UPI', 'ACTIVE', 3000, 9000, ((now() at time zone 'utc') - interval '1560 hours'), (((now() at time zone 'utc') - interval '1560 hours') + interval '12 months'), ((now() at time zone 'utc') - interval '1560 hours'), ((now() at time zone 'utc') - interval '120 hours')),
  ('up-priya-growth', 'usr-priya', 'seed-plan-growth', 'seed-compound-10', 1, 3, 7, 5000, 'MONTHLY', 'MONTH', 1, 'CARD', 'ACTIVE', 10000, 110000, ((now() at time zone 'utc') - interval '1440 hours'), (((now() at time zone 'utc') - interval '1440 hours') + interval '24 months'), ((now() at time zone 'utc') - interval '1440 hours'), ((now() at time zone 'utc') - interval '720 hours')),
  ('up-rahul-lumpsum', 'usr-rahul', 'sample-plan-lumpsum', 'sample-custom-8', 1, 2.5, 4, 10000, 'LUMPSUM', 'MONTH', 1, 'NETBANKING', 'ACTIVE', 10000, 0, ((now() at time zone 'utc') - interval '600 hours'), (((now() at time zone 'utc') - interval '600 hours') + interval '12 months'), ((now() at time zone 'utc') - interval '600 hours'), ((now() at time zone 'utc') - interval '600 hours'));


-- ---------------------------------------------------------------------------
-- Payment mandates (simulated Razorpay AutoPay)
-- ---------------------------------------------------------------------------

INSERT INTO "PaymentMandate" ("id", "userPlanId", "gatewayMandateId", "status", "createdAt", "updatedAt") VALUES
  ('pm-demo-legacy', 'up-demo-legacy', 'SIM-MANDATE-000001-a1b2c3', 'EXPIRED', ((now() at time zone 'utc') - interval '6480 hours'), ((now() at time zone 'utc') - interval '2160 hours')),
  ('pm-demo-basic', 'up-demo-basic', 'SIM-MANDATE-000002-d4e5f6', 'ACTIVE', ((now() at time zone 'utc') - interval '1560 hours'), ((now() at time zone 'utc') - interval '1560 hours')),
  ('pm-priya-growth', 'up-priya-growth', 'SIM-MANDATE-000003-0a1b2c', 'ACTIVE', ((now() at time zone 'utc') - interval '1440 hours'), ((now() at time zone 'utc') - interval '1440 hours')),
  ('pm-rahul-lumpsum', 'up-rahul-lumpsum', 'SIM-MANDATE-000004-3d4e5f', 'ACTIVE', ((now() at time zone 'utc') - interval '600 hours'), ((now() at time zone 'utc') - interval '600 hours'));


-- ---------------------------------------------------------------------------
-- Payments and webhook events
-- ---------------------------------------------------------------------------

INSERT INTO "Payment" ("id", "userPlanId", "mandateId", "idempotencyKey", "gatewayOrderId", "gatewayPaymentId", "status", "amount", "method", "retryCount", "scheduledDate", "actualDate", "gracePeriodEndsAt", "nextRetryAt", "manualWindowEndsAt", "createdAt", "updatedAt") VALUES
  ('pay-demo-legacy-1', 'up-demo-legacy', 'pm-demo-legacy', 'first-payment-up-demo-legacy', 'SIM-ORDER-000001-019919', 'SIM-PAY-000001-001eef', 'SUCCESS', 1000, 'UPI', 0, ((now() at time zone 'utc') - interval '6480 hours'), ((now() at time zone 'utc') - interval '6480 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '6480 hours'), ((now() at time zone 'utc') - interval '6480 hours')),
  ('pay-demo-legacy-2', 'up-demo-legacy', 'pm-demo-legacy', 'cycle-2-up-demo-legacy', 'SIM-ORDER-000002-033232', 'SIM-PAY-000002-003dde', 'SUCCESS', 1000, 'UPI', 0, ((now() at time zone 'utc') - interval '5760 hours'), ((now() at time zone 'utc') - interval '5760 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '5760 hours'), ((now() at time zone 'utc') - interval '5760 hours')),
  ('pay-demo-legacy-3', 'up-demo-legacy', 'pm-demo-legacy', 'cycle-3-up-demo-legacy', 'SIM-ORDER-000003-04cb4b', 'SIM-PAY-000003-005ccd', 'SUCCESS', 1000, 'UPI', 0, ((now() at time zone 'utc') - interval '5040 hours'), ((now() at time zone 'utc') - interval '5040 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '5040 hours'), ((now() at time zone 'utc') - interval '5040 hours')),
  ('pay-demo-legacy-4', 'up-demo-legacy', 'pm-demo-legacy', 'cycle-4-up-demo-legacy', 'SIM-ORDER-000004-066464', 'SIM-PAY-000004-007bbc', 'SUCCESS', 1000, 'UPI', 0, ((now() at time zone 'utc') - interval '4320 hours'), ((now() at time zone 'utc') - interval '4320 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '4320 hours'), ((now() at time zone 'utc') - interval '4320 hours')),
  ('pay-demo-legacy-5', 'up-demo-legacy', 'pm-demo-legacy', 'cycle-5-up-demo-legacy', 'SIM-ORDER-000005-07fd7d', 'SIM-PAY-000005-009aab', 'SUCCESS', 1000, 'UPI', 0, ((now() at time zone 'utc') - interval '3600 hours'), ((now() at time zone 'utc') - interval '3600 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '3600 hours'), ((now() at time zone 'utc') - interval '3600 hours')),
  ('pay-demo-legacy-6', 'up-demo-legacy', 'pm-demo-legacy', 'cycle-6-up-demo-legacy', 'SIM-ORDER-000006-099696', 'SIM-PAY-000006-00b99a', 'SUCCESS', 1000, 'UPI', 0, ((now() at time zone 'utc') - interval '2880 hours'), ((now() at time zone 'utc') - interval '2880 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '2880 hours'), ((now() at time zone 'utc') - interval '2880 hours')),
  ('pay-demo-basic-1', 'up-demo-basic', 'pm-demo-basic', 'first-payment-up-demo-basic', 'SIM-ORDER-000007-0b2faf', 'SIM-PAY-000007-00d889', 'SUCCESS', 1000, 'UPI', 0, ((now() at time zone 'utc') - interval '1560 hours'), ((now() at time zone 'utc') - interval '1560 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '1560 hours'), ((now() at time zone 'utc') - interval '1560 hours')),
  ('pay-demo-basic-2', 'up-demo-basic', 'pm-demo-basic', 'cycle-2-up-demo-basic', 'SIM-ORDER-000008-0cc8c8', 'SIM-PAY-000008-00f778', 'SUCCESS', 1000, 'UPI', 0, ((now() at time zone 'utc') - interval '840 hours'), ((now() at time zone 'utc') - interval '840 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '840 hours'), ((now() at time zone 'utc') - interval '840 hours')),
  ('pay-demo-basic-3', 'up-demo-basic', 'pm-demo-basic', 'cycle-3-up-demo-basic', 'SIM-ORDER-000009-0e61e1', 'SIM-PAY-000009-011667', 'SUCCESS', 1000, 'UPI', 0, ((now() at time zone 'utc') - interval '120 hours'), ((now() at time zone 'utc') - interval '120 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '120 hours'), ((now() at time zone 'utc') - interval '120 hours')),
  ('pay-priya-1', 'up-priya-growth', 'pm-priya-growth', 'first-payment-up-priya-growth', 'SIM-ORDER-000010-0ffafa', 'SIM-PAY-000010-013556', 'SUCCESS', 5000, 'CARD', 0, ((now() at time zone 'utc') - interval '1440 hours'), ((now() at time zone 'utc') - interval '1440 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '1440 hours'), ((now() at time zone 'utc') - interval '1440 hours')),
  ('pay-priya-2', 'up-priya-growth', 'pm-priya-growth', 'cycle-2-up-priya-growth', 'SIM-ORDER-000011-119413', 'SIM-PAY-000011-015445', 'SUCCESS', 5000, 'CARD', 0, ((now() at time zone 'utc') - interval '720 hours'), ((now() at time zone 'utc') - interval '720 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '720 hours'), ((now() at time zone 'utc') - interval '720 hours')),
  ('pay-rahul-1', 'up-rahul-lumpsum', 'pm-rahul-lumpsum', 'first-payment-up-rahul-lumpsum', 'SIM-ORDER-000012-132d2c', 'SIM-PAY-000012-017334', 'SUCCESS', 10000, 'NETBANKING', 0, ((now() at time zone 'utc') - interval '600 hours'), ((now() at time zone 'utc') - interval '600 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '600 hours'), ((now() at time zone 'utc') - interval '600 hours')),
  ('pay-priya-3', 'up-priya-growth', 'pm-priya-growth', 'cycle-3-up-priya-growth', 'SIM-ORDER-000013-14c645', NULL, 'RETRYING', 5000, 'CARD', 0, ((now() at time zone 'utc') - interval '19 hours'), NULL, ((now() at time zone 'utc') + interval '5 hours'), ((now() at time zone 'utc') - interval '1 hours'), NULL, ((now() at time zone 'utc') - interval '19 hours'), ((now() at time zone 'utc') - interval '19 hours'));

INSERT INTO "PaymentEvent" ("id", "paymentId", "eventType", "gatewayEventId", "signatureVerified", "rawPayload", "processedAt") VALUES
  ('evt-pay-demo-legacy-1', 'pay-demo-legacy-1', 'payment.captured', 'SIM-EVT-000001-13d4fd', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '6480 hours')),
  ('evt-pay-demo-legacy-2', 'pay-demo-legacy-2', 'payment.captured', 'SIM-EVT-000002-27a9fa', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '5760 hours')),
  ('evt-pay-demo-legacy-3', 'pay-demo-legacy-3', 'payment.captured', 'SIM-EVT-000003-3b7ef7', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '5040 hours')),
  ('evt-pay-demo-legacy-4', 'pay-demo-legacy-4', 'payment.captured', 'SIM-EVT-000004-4f53f4', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '4320 hours')),
  ('evt-pay-demo-legacy-5', 'pay-demo-legacy-5', 'payment.captured', 'SIM-EVT-000005-6328f1', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '3600 hours')),
  ('evt-pay-demo-legacy-6', 'pay-demo-legacy-6', 'payment.captured', 'SIM-EVT-000006-76fdee', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '2880 hours')),
  ('evt-pay-demo-basic-1', 'pay-demo-basic-1', 'payment.captured', 'SIM-EVT-000007-8ad2eb', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '1560 hours')),
  ('evt-pay-demo-basic-2', 'pay-demo-basic-2', 'payment.captured', 'SIM-EVT-000008-9ea7e8', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '840 hours')),
  ('evt-pay-demo-basic-3', 'pay-demo-basic-3', 'payment.captured', 'SIM-EVT-000009-b27ce5', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '120 hours')),
  ('evt-pay-priya-1', 'pay-priya-1', 'payment.captured', 'SIM-EVT-000010-c651e2', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '1440 hours')),
  ('evt-pay-priya-2', 'pay-priya-2', 'payment.captured', 'SIM-EVT-000011-da26df', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '720 hours')),
  ('evt-pay-rahul-1', 'pay-rahul-1', 'payment.captured', 'SIM-EVT-000012-edfbdc', TRUE, '{"simulated":true,"outcome":"SUCCESS","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '600 hours')),
  ('evt-pay-priya-3', 'pay-priya-3', 'payment.failed', 'SIM-EVT-000013-101d0d9', TRUE, '{"simulated":true,"outcome":"FAILED","attempt":0}'::jsonb, ((now() at time zone 'utc') - interval '19 hours'));


-- ---------------------------------------------------------------------------
-- Referrals and commissions
-- ---------------------------------------------------------------------------

INSERT INTO "Referral" ("id", "referrerUserId", "referredUserId", "referralCodeUsed", "status", "expiryDate", "cancellationReason", "cancelledBy", "cancelledAt", "createdAt") VALUES
  ('ref-priya', 'usr-demo', 'usr-priya', 'USER0001', 'ACTIVE', ((now() at time zone 'utc') + interval '7200 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '1488 hours')),
  ('ref-rahul', 'usr-demo', 'usr-rahul', 'USER0001', 'ACTIVE', ((now() at time zone 'utc') + interval '8160 hours'), NULL, NULL, NULL, ((now() at time zone 'utc') - interval '648 hours')),
  ('ref-neha', 'usr-priya', 'usr-neha', 'PRIYA001', 'CANCELLED', ((now() at time zone 'utc') + interval '8280 hours'), 'Duplicate account suspected', 'usr-admin', ((now() at time zone 'utc') - interval '72 hours'), ((now() at time zone 'utc') - interval '480 hours'));

INSERT INTO "Commission" ("id", "referralId", "userPlanId", "paymentId", "amount", "status", "commissionType", "cyclePosition", "accrualDate", "approvalDate", "creditDate", "withdrawalDate") VALUES
  ('com-priya-1', 'ref-priya', 'up-priya-growth', 'pay-priya-1', 350, 'AVAILABLE_FOR_WITHDRAWAL', 'ONE_TIME', 1, ((now() at time zone 'utc') - interval '1440 hours'), ((now() at time zone 'utc') - interval '600 hours'), ((now() at time zone 'utc') - interval '480 hours'), NULL),
  ('com-rahul-1', 'ref-rahul', 'up-rahul-lumpsum', 'pay-rahul-1', 400, 'ACCRUED', 'ONE_TIME', 1, ((now() at time zone 'utc') - interval '600 hours'), NULL, NULL, NULL);


-- ---------------------------------------------------------------------------
-- Unified ledger (balanceBefore/balanceAfter are internally consistent per user)
-- ---------------------------------------------------------------------------

INSERT INTO "LedgerEntry" ("id", "userId", "userPlanId", "paymentId", "transactionType", "amount", "balanceBefore", "balanceAfter", "referrerUserId", "commissionId", "approverUserId", "approvalTimestamp", "description", "interestMethodId", "interestMethodVersion", "transactionTimestamp") VALUES
  ('led-001', 'usr-demo', 'up-demo-legacy', 'pay-demo-legacy-1', 'PLAN_PAYMENT', 1000, 0, 1000, NULL, NULL, NULL, NULL, 'Instalment payment for Legacy Saver Plan', NULL, NULL, ((now() at time zone 'utc') - interval '6480 hours')),
  ('led-002', 'usr-demo', 'up-demo-legacy', 'pay-demo-legacy-2', 'PLAN_PAYMENT', 1000, 1000, 2000, NULL, NULL, NULL, NULL, 'Instalment payment for Legacy Saver Plan', NULL, NULL, ((now() at time zone 'utc') - interval '5760 hours')),
  ('led-003', 'usr-demo', 'up-demo-legacy', 'pay-demo-legacy-3', 'PLAN_PAYMENT', 1000, 2000, 3000, NULL, NULL, NULL, NULL, 'Instalment payment for Legacy Saver Plan', NULL, NULL, ((now() at time zone 'utc') - interval '5040 hours')),
  ('led-004', 'usr-demo', 'up-demo-legacy', 'pay-demo-legacy-4', 'PLAN_PAYMENT', 1000, 3000, 4000, NULL, NULL, NULL, NULL, 'Instalment payment for Legacy Saver Plan', NULL, NULL, ((now() at time zone 'utc') - interval '4320 hours')),
  ('led-005', 'usr-demo', 'up-demo-legacy', 'pay-demo-legacy-5', 'PLAN_PAYMENT', 1000, 4000, 5000, NULL, NULL, NULL, NULL, 'Instalment payment for Legacy Saver Plan', NULL, NULL, ((now() at time zone 'utc') - interval '3600 hours')),
  ('led-006', 'usr-demo', 'up-demo-legacy', 'pay-demo-legacy-6', 'PLAN_PAYMENT', 1000, 5000, 6000, NULL, NULL, NULL, NULL, 'Instalment payment for Legacy Saver Plan', NULL, NULL, ((now() at time zone 'utc') - interval '2880 hours')),
  ('led-007', 'usr-demo', 'up-demo-legacy', NULL, 'INTEREST', 360, 6000, 6360, NULL, NULL, NULL, NULL, 'Maturity interest for Legacy Saver Plan (up-demo-legacy)', 'sample-simple-6', 1, ((now() at time zone 'utc') - interval '2160 hours')),
  ('led-008', 'usr-demo', 'up-demo-basic', 'pay-demo-basic-1', 'PLAN_PAYMENT', 1000, 6360, 7360, NULL, NULL, NULL, NULL, 'Instalment payment for Basic Growth Plan', NULL, NULL, ((now() at time zone 'utc') - interval '1560 hours')),
  ('led-009', 'usr-demo', 'up-demo-basic', 'pay-demo-basic-2', 'PLAN_PAYMENT', 1000, 7360, 8360, NULL, NULL, NULL, NULL, 'Instalment payment for Basic Growth Plan', NULL, NULL, ((now() at time zone 'utc') - interval '840 hours')),
  ('led-010', 'usr-demo', NULL, NULL, 'COMMISSION', 350, 8360, 8710, 'usr-demo', 'com-priya-1', 'usr-admin', ((now() at time zone 'utc') - interval '480 hours'), 'Referral commission (ONE_TIME) credited', NULL, NULL, ((now() at time zone 'utc') - interval '480 hours')),
  ('led-011', 'usr-demo', NULL, NULL, 'REDEMPTION_DONATION', -500, 8710, 8210, NULL, NULL, 'usr-admin', ((now() at time zone 'utc') - interval '240 hours'), 'Redemption approved: DONATION (rr-donation-approved)', NULL, NULL, ((now() at time zone 'utc') - interval '240 hours')),
  ('led-012', 'usr-demo', 'up-demo-basic', 'pay-demo-basic-3', 'PLAN_PAYMENT', 1000, 8210, 9210, NULL, NULL, NULL, NULL, 'Instalment payment for Basic Growth Plan', NULL, NULL, ((now() at time zone 'utc') - interval '120 hours')),
  ('led-013', 'usr-priya', 'up-priya-growth', 'pay-priya-1', 'PLAN_PAYMENT', 5000, 0, 5000, NULL, NULL, NULL, NULL, 'Instalment payment for Premium Growth Plan', NULL, NULL, ((now() at time zone 'utc') - interval '1440 hours')),
  ('led-014', 'usr-priya', 'up-priya-growth', 'pay-priya-2', 'PLAN_PAYMENT', 5000, 5000, 10000, NULL, NULL, NULL, NULL, 'Instalment payment for Premium Growth Plan', NULL, NULL, ((now() at time zone 'utc') - interval '720 hours')),
  ('led-015', 'usr-rahul', 'up-rahul-lumpsum', 'pay-rahul-1', 'PLAN_PAYMENT', 10000, 0, 10000, NULL, NULL, NULL, NULL, 'Instalment payment for Lumpsum Saver Plan', NULL, NULL, ((now() at time zone 'utc') - interval '600 hours'));


-- ---------------------------------------------------------------------------
-- Catalogue: universities, courses, donation recipients, gadgets, colleges, franchisee plans
-- ---------------------------------------------------------------------------

INSERT INTO "University" ("id", "name") VALUES
  ('uni-demo', 'Demo State University'),
  ('uni-tech', 'Demo Institute of Technology');

INSERT INTO "Course" ("id", "universityId", "name", "fee") VALUES
  ('seed-course-1', 'uni-demo', 'B.Sc Computer Science', 50000),
  ('course-2', 'uni-demo', 'B.Com Honours', 40000),
  ('course-3', 'uni-tech', 'B.Tech Mechanical Engineering', 120000);

INSERT INTO "DonationRecipient" ("id", "name", "active") VALUES
  ('dr-relief', 'Demo Relief Foundation', TRUE),
  ('dr-edu', 'Demo Education Trust', TRUE),
  ('dr-retired', 'Retired Charity (inactive)', FALSE);

INSERT INTO "GadgetItem" ("id", "category", "name", "price", "stockQuantity", "reservedQuantity") VALUES
  ('seed-gadget-1', 'Electronics', 'Wireless Earbuds', 2000, 50, 1),
  ('gadget-2', 'Electronics', 'Smart Watch', 6500, 25, 0),
  ('gadget-3', 'Accessories', 'Laptop Backpack', 1800, 40, 0);

INSERT INTO "College" ("id", "name") VALUES
  ('col-1', 'Demo Engineering College'),
  ('col-2', 'Demo Arts & Science College'),
  ('col-3', 'Demo Management Institute');

INSERT INTO "FranchiseePlan" ("id", "name", "oneTimeDeductiblePrice") VALUES
  ('seed-franchisee-1', 'Standard Franchisee Plan', 100000),
  ('fran-2', 'Starter Franchisee Plan', 40000);

INSERT INTO "FranchiseePlanCollegeMapping" ("franchiseePlanId", "collegeId") VALUES
  ('seed-franchisee-1', 'col-1'),
  ('seed-franchisee-1', 'col-2'),
  ('fran-2', 'col-2'),
  ('fran-2', 'col-3');


-- ---------------------------------------------------------------------------
-- Redemption requests, gadget cart lines, status timeline, franchisee enquiries
-- ---------------------------------------------------------------------------

INSERT INTO "RedemptionRequest" ("id", "userId", "category", "status", "requestedAmount", "availableMarginAtRequest", "shortfallAmount", "reservedAmount", "shortfallReference", "shortfallVerifiedBy", "shortfallVerifiedAt", "relatedCourseId", "rewardPointsApplied", "targetPlanId", "donationRecipientId", "consentGiven", "consentGivenAt", "donationReference", "receiptGeneratedAt", "comments", "expiresAt", "createdAt", "updatedAt") VALUES
  ('rr-donation-approved', 'usr-demo', 'DONATION', 'APPROVED', 500, 6710, 0, 0, NULL, NULL, NULL, NULL, 0, NULL, 'dr-relief', TRUE, ((now() at time zone 'utc') - interval '288 hours'), 'DON-0001AB12', ((now() at time zone 'utc') - interval '216 hours'), 'Annual donation', ((now() at time zone 'utc') - interval '120 hours'), ((now() at time zone 'utc') - interval '288 hours'), ((now() at time zone 'utc') - interval '240 hours')),
  ('rr-refund-pending', 'usr-demo', 'REFUND', 'PENDING', 1000, 6210, 0, 1000, NULL, NULL, NULL, NULL, 0, NULL, NULL, FALSE, NULL, NULL, NULL, 'Refund of surplus balance', ((now() at time zone 'utc') + interval '120 hours'), ((now() at time zone 'utc') - interval '48 hours'), ((now() at time zone 'utc') - interval '48 hours')),
  ('rr-gadget-shortfall', 'usr-priya', 'GADGETS', 'AWAITING_SHORTFALL_RESOLUTION', 2000, 0, 2000, 2000, NULL, NULL, NULL, NULL, 0, NULL, NULL, FALSE, NULL, NULL, NULL, NULL, ((now() at time zone 'utc') + interval '144 hours'), ((now() at time zone 'utc') - interval '24 hours'), ((now() at time zone 'utc') - interval '24 hours')),
  ('rr-course-rejected', 'usr-rahul', 'COURSE', 'REJECTED', 40000, 0, 40000, 0, NULL, NULL, NULL, 'course-2', 0, NULL, NULL, FALSE, NULL, NULL, NULL, 'B.Com Honours enrolment', ((now() at time zone 'utc') - interval '72 hours'), ((now() at time zone 'utc') - interval '240 hours'), ((now() at time zone 'utc') - interval '192 hours'));

INSERT INTO "RedemptionGadgetItem" ("id", "redemptionRequestId", "gadgetItemId", "quantity", "priceAtRequest", "createdAt") VALUES
  ('rgi-1', 'rr-gadget-shortfall', 'seed-gadget-1', 1, 2000, ((now() at time zone 'utc') - interval '24 hours'));

INSERT INTO "RedemptionStatusEvent" ("id", "redemptionRequestId", "status", "note", "actorUserId", "createdAt") VALUES
  ('rse-1', 'rr-donation-approved', 'PENDING', NULL, 'usr-demo', ((now() at time zone 'utc') - interval '288 hours')),
  ('rse-2', 'rr-donation-approved', 'APPROVED', NULL, 'usr-admin', ((now() at time zone 'utc') - interval '240 hours')),
  ('rse-3', 'rr-refund-pending', 'PENDING', NULL, 'usr-demo', ((now() at time zone 'utc') - interval '48 hours')),
  ('rse-4', 'rr-gadget-shortfall', 'AWAITING_SHORTFALL_RESOLUTION', NULL, 'usr-priya', ((now() at time zone 'utc') - interval '24 hours')),
  ('rse-5', 'rr-course-rejected', 'AWAITING_SHORTFALL_RESOLUTION', NULL, 'usr-rahul', ((now() at time zone 'utc') - interval '240 hours')),
  ('rse-6', 'rr-course-rejected', 'REJECTED', 'Shortfall was not resolved within the SLA', 'usr-admin', ((now() at time zone 'utc') - interval '192 hours'));

INSERT INTO "FranchiseeRedemptionEnquiry" ("id", "userId", "franchiseePlanId", "collegeId", "status", "requestedAmount", "availableMarginAtRequest", "shortfallAmount", "shortfallReference", "shortfallVerifiedBy", "shortfallVerifiedAt", "expiresAt", "createdAt", "updatedAt") VALUES
  ('fe-rahul-1', 'usr-rahul', 'fran-2', 'col-3', 'CANCELLED', 40000, 0, 40000, NULL, NULL, NULL, ((now() at time zone 'utc') + interval '24 hours'), ((now() at time zone 'utc') - interval '144 hours'), ((now() at time zone 'utc') - interval '120 hours'));


-- ---------------------------------------------------------------------------
-- Notifications, simulated email outbox, audit log, login history
-- ---------------------------------------------------------------------------

INSERT INTO "Notification" ("id", "userId", "type", "title", "message", "isRead", "readAt", "relatedEntityRef", "createdAt") VALUES
  ('ntf-1', 'usr-demo', 'REGISTRATION', 'Welcome!', 'Your account has been created successfully.', TRUE, ((now() at time zone 'utc') - interval '6696 hours'), NULL, ((now() at time zone 'utc') - interval '6720 hours')),
  ('ntf-2', 'usr-demo', 'PLAN_MATURITY', 'Plan matured', 'Your Legacy Saver Plan plan has matured. Interest of ₹360.00 has been credited to your redeemable balance.', TRUE, ((now() at time zone 'utc') - interval '2136 hours'), 'up-demo-legacy', ((now() at time zone 'utc') - interval '2160 hours')),
  ('ntf-3', 'usr-demo', 'REFUND_PROCESSED', 'Redemption approved', 'Your donation redemption of ₹500.00 has been approved and processed.', TRUE, ((now() at time zone 'utc') - interval '216 hours'), 'rr-donation-approved', ((now() at time zone 'utc') - interval '240 hours')),
  ('ntf-4', 'usr-demo', 'REFERRAL_EARNED', 'Referral commission credited', 'Your commission of ₹350.00 has been credited and is now available for withdrawal.', FALSE, NULL, 'com-priya-1', ((now() at time zone 'utc') - interval '480 hours')),
  ('ntf-5', 'usr-demo', 'INSTALMENT_REMINDER', 'Upcoming instalment reminder', 'Your next instalment of ₹1,000.00 for Basic Growth Plan is due soon.', FALSE, NULL, NULL, ((now() at time zone 'utc') - interval '24 hours')),
  ('ntf-6', 'usr-priya', 'REGISTRATION', 'Welcome!', 'Your account has been created successfully.', TRUE, ((now() at time zone 'utc') - interval '1464 hours'), NULL, ((now() at time zone 'utc') - interval '1488 hours')),
  ('ntf-7', 'usr-priya', 'PAYMENT_FAILURE', 'Payment failed', 'Your scheduled payment of ₹5,000.00 could not be processed. We will automatically retry.', FALSE, NULL, 'pay-priya-3', ((now() at time zone 'utc') - interval '19 hours')),
  ('ntf-8', 'usr-rahul', 'ADMIN_MESSAGE', 'Redemption rejected', 'Your course redemption request of ₹40,000.00 was rejected by the Admin: Shortfall was not resolved within the SLA', FALSE, NULL, 'rr-course-rejected', ((now() at time zone 'utc') - interval '192 hours')),
  ('ntf-9', 'usr-admin', 'GENERAL_ENQUIRY_RECEIVED', 'New general enquiry', 'A new enquiry was submitted from the Contact Us page.', FALSE, NULL, 'ge-1', ((now() at time zone 'utc') - interval '24 hours'));

INSERT INTO "EmailMessage" ("id", "recipient", "subject", "body", "templateType", "status", "relatedEntityRef", "createdAt") VALUES
  ('em-1', 'user@demo.local', 'Welcome — Registration Successful', 'Your account has been created. Your referral code is USER0001.', 'REGISTRATION', 'SENT', 'usr-demo', ((now() at time zone 'utc') - interval '6720 hours')),
  ('em-2', 'priya.sharma@demo.local', 'Welcome — Registration Successful', 'Your account has been created. Your referral code is PRIYA001.', 'REGISTRATION', 'SENT', 'usr-priya', ((now() at time zone 'utc') - interval '1488 hours')),
  ('em-3', 'admin@demo.local', 'Login Verification Code', 'Your login verification code is: 000000

This code expires in 5 minutes. If you did not request this, you can ignore this email.', 'LOGIN_2FA', 'SENT', 'usr-admin', ((now() at time zone 'utc') - interval '24 hours')),
  ('em-4', 'user@demo.local', 'Payment Successful', 'Your payment of ₹1,000.00 for Basic Growth Plan was successful.', 'PAYMENT_RECEIPT', 'SENT', 'pay-demo-basic-3', ((now() at time zone 'utc') - interval '120 hours')),
  ('em-5', 'priya.sharma@demo.local', 'Payment Failed', 'Your scheduled payment of ₹5,000.00 for Premium Growth Plan could not be processed. We will automatically retry.', 'PAYMENT_RECEIPT', 'SENT', 'pay-priya-3', ((now() at time zone 'utc') - interval '19 hours'));

INSERT INTO "AuditLog" ("id", "actorUserId", "eventType", "entityRef", "details", "timestamp") VALUES
  ('aud-1', 'usr-demo', 'USER_REGISTERED', 'usr-demo', NULL, ((now() at time zone 'utc') - interval '6720 hours')),
  ('aud-2', 'usr-priya', 'PLAN_SUBSCRIBED', 'up-priya-growth', NULL, ((now() at time zone 'utc') - interval '1440 hours')),
  ('aud-3', 'usr-admin', 'COMMISSION_APPROVED', 'com-priya-1', NULL, ((now() at time zone 'utc') - interval '600 hours')),
  ('aud-4', 'usr-admin', 'COMMISSION_CREDITED', 'com-priya-1', NULL, ((now() at time zone 'utc') - interval '480 hours')),
  ('aud-5', 'usr-demo', 'REDEMPTION_REQUESTED', 'rr-donation-approved', '{"category":"DONATION"}'::jsonb, ((now() at time zone 'utc') - interval '288 hours')),
  ('aud-6', 'usr-admin', 'REDEMPTION_APPROVED', 'rr-donation-approved', NULL, ((now() at time zone 'utc') - interval '240 hours')),
  ('aud-7', 'usr-admin', 'REFERRAL_CANCELLED', 'ref-neha', '{"reason":"Duplicate account suspected"}'::jsonb, ((now() at time zone 'utc') - interval '72 hours')),
  ('aud-8', 'usr-neha', 'LOGIN_FAILED', 'usr-neha', NULL, ((now() at time zone 'utc') - interval '96 hours')),
  ('aud-9', 'usr-admin', 'SITE_SETTINGS_UPDATED', NULL, '{"redemptionExpiryDays":7}'::jsonb, ((now() at time zone 'utc') - interval '720 hours'));

INSERT INTO "LoginHistory" ("id", "userId", "result", "loginAt", "logoutAt", "ipAddress", "userAgent") VALUES
  ('lh-1', 'usr-demo', 'SUCCESS', ((now() at time zone 'utc') - interval '48 hours'), ((now() at time zone 'utc') - interval '47 hours'), '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'),
  ('lh-2', 'usr-demo', 'SUCCESS', ((now() at time zone 'utc') - interval '2 hours'), NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'),
  ('lh-3', 'usr-demo', 'FAILED', ((now() at time zone 'utc') - interval '120 hours'), NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'),
  ('lh-4', 'usr-admin', 'SUCCESS', ((now() at time zone 'utc') - interval '24 hours'), NULL, '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605'),
  ('lh-neha-1', 'usr-neha', 'FAILED', ((now() at time zone 'utc') - interval '96 hours'), NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131'),
  ('lh-neha-2', 'usr-neha', 'FAILED', ((now() at time zone 'utc') - interval '96 hours'), NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131'),
  ('lh-neha-3', 'usr-neha', 'FAILED', ((now() at time zone 'utc') - interval '96 hours'), NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131'),
  ('lh-neha-4', 'usr-neha', 'FAILED', ((now() at time zone 'utc') - interval '96 hours'), NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131'),
  ('lh-neha-5', 'usr-neha', 'FAILED', ((now() at time zone 'utc') - interval '96 hours'), NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131');


-- ---------------------------------------------------------------------------
-- Site settings (overrides of the defaults in src/lib/config.ts) and public content
-- ---------------------------------------------------------------------------

INSERT INTO "SiteSetting" ("key", "value", "updatedAt") VALUES
  ('referralValidityDays', '365', ((now() at time zone 'utc') - interval '720 hours')),
  ('redemptionExpiryDays', '7', ((now() at time zone 'utc') - interval '720 hours')),
  ('paymentRetryCount', '3', ((now() at time zone 'utc') - interval '720 hours')),
  ('instalmentReminderLeadDays', '3', ((now() at time zone 'utc') - interval '720 hours'));

INSERT INTO "GeneralEnquiry" ("id", "userId", "name", "email", "phone", "message", "status", "source", "ipAddress", "adminComment", "resolvedAt", "resolvedById", "createdAt", "updatedAt", "anonymizedAt") VALUES
  ('ge-1', NULL, 'Asha Rao', 'asha.rao@example.com', '+919811111111', 'I would like to know more about the Premium Growth Plan.', 'NEW', 'CONTACT_PAGE', '127.0.0.1', NULL, NULL, NULL, ((now() at time zone 'utc') - interval '24 hours'), ((now() at time zone 'utc') - interval '24 hours'), NULL),
  ('ge-2', 'usr-demo', 'Demo User', 'user@demo.local', NULL, 'How do I change my registered mobile number?', 'RESOLVED', 'CONTACT_PAGE', '127.0.0.1', 'Explained the Account page steps.', ((now() at time zone 'utc') - interval '336 hours'), 'usr-admin', ((now() at time zone 'utc') - interval '360 hours'), ((now() at time zone 'utc') - interval '336 hours'), NULL);

INSERT INTO "AboutUsSectionDraft" ("id", "heading", "body", "order", "updatedAt") VALUES
  ('about-draft-1', 'Who we are', 'We help families save for education through disciplined, goal-based investment plans.', 1, ((now() at time zone 'utc') - interval '480 hours')),
  ('about-draft-2', 'How it works', 'Subscribe to a plan, pay through AutoPay, and redeem the matured balance for courses, gadgets or donations.', 2, ((now() at time zone 'utc') - interval '480 hours')),
  ('about-draft-3', 'Our commitment', 'Transparent rules, a single auditable ledger, and every approval recorded.', 3, ((now() at time zone 'utc') - interval '480 hours'));

INSERT INTO "AboutUsSectionPublished" ("id", "heading", "body", "order", "publishedAt") VALUES
  ('about-pub-1', 'Who we are', 'We help families save for education through disciplined, goal-based investment plans.', 1, ((now() at time zone 'utc') - interval '480 hours')),
  ('about-pub-2', 'How it works', 'Subscribe to a plan, pay through AutoPay, and redeem the matured balance for courses, gadgets or donations.', 2, ((now() at time zone 'utc') - interval '480 hours')),
  ('about-pub-3', 'Our commitment', 'Transparent rules, a single auditable ledger, and every approval recorded.', 3, ((now() at time zone 'utc') - interval '480 hours'));

INSERT INTO "ContactUsContent" ("id", "draftAddress", "draftPhone", "draftEmail", "draftWebsite", "draftSocialLinks", "publishedAddress", "publishedPhone", "publishedEmail", "publishedWebsite", "publishedSocialLinks", "publishedAt", "updatedAt") VALUES
  ('contact-1', '12 Example Street, Mumbai 400001', '+91 22 0000 0000', 'support@demo.local', 'https://example.org', '[{"platform":"Twitter","url":"https://twitter.com/example"}]'::jsonb, '12 Example Street, Mumbai 400001', '+91 22 0000 0000', 'support@demo.local', 'https://example.org', '[{"platform":"Twitter","url":"https://twitter.com/example"}]'::jsonb, ((now() at time zone 'utc') - interval '480 hours'), ((now() at time zone 'utc') - interval '480 hours'));

COMMIT;

-- Quick sanity check (optional)
SELECT 'User' AS "table", count(*) FROM "User"
UNION ALL SELECT 'Plan', count(*) FROM "Plan"
UNION ALL SELECT 'UserPlan', count(*) FROM "UserPlan"
UNION ALL SELECT 'Payment', count(*) FROM "Payment"
UNION ALL SELECT 'LedgerEntry', count(*) FROM "LedgerEntry"
UNION ALL SELECT 'RedemptionRequest', count(*) FROM "RedemptionRequest";
