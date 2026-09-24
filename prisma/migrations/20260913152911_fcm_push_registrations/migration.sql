-- Master Prompt.md SS10/24-27: replace the VAPID Web Push registration shape
-- (endpoint/p256dh/auth) with a real Firebase Cloud Messaging registration
-- token. Existing legacy VAPID rows are not real FCM tokens, so rather than
-- deleting them (non-destructive per project policy) they are given a unique
-- placeholder token and marked revoked/inactive -- they will never match a
-- real device and will simply be ignored by the new FCM sender.

ALTER TABLE "PushSubscription" ADD COLUMN "fcmToken" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "platform" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "lastError" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "PushSubscription" SET
  "fcmToken" = 'legacy-vapid-' || "id",
  "lastError" = 'superseded-by-fcm-migration',
  "revokedAt" = COALESCE("revokedAt", now()),
  "updatedAt" = now();

ALTER TABLE "PushSubscription" ALTER COLUMN "fcmToken" SET NOT NULL;
ALTER TABLE "PushSubscription" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "PushSubscription" DROP COLUMN "endpoint";
ALTER TABLE "PushSubscription" DROP COLUMN "p256dh";
ALTER TABLE "PushSubscription" DROP COLUMN "auth";

CREATE UNIQUE INDEX "PushSubscription_fcmToken_key" ON "PushSubscription"("fcmToken");

-- Master Prompt.md SS35: General Enquiry Received now also creates a durable
-- Notification row (in addition to the existing simulated admin email),
-- which is what the createNotification() FCM hook keys off of.
ALTER TYPE "NotificationType" ADD VALUE 'GENERAL_ENQUIRY_RECEIVED';
