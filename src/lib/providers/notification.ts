import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";
import { sendFcmPush } from "@/lib/push/fcm";

// Master Prompt.md §10/§24: Business Event -> Notification Service ->
// Persistent Notification Record -> Firebase FCM Push Provider. The
// Notification DB row (shown at /dashboard/notifications) is always written
// first and is the durable notification history; the real FCM push is an
// additional delivery channel on top of it, never a replacement for it.

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityRef?: string;
};

// §33 FCM event mapping: safe deep-link per notification type. Every one of
// these types is created via createNotification() below, so this is the
// single place that needs to stay in sync with new notification types.
//
// Must return an ABSOLUTE URL: this flows straight into FCM's
// webpush.fcmOptions.link (see sendFcmPush in src/lib/push/fcm.ts), and the
// FCM Admin SDK rejects a relative path there with
// `messaging/invalid-argument` — which sendFcmPush's own error handling then
// (mis)treats as a dead token and revokes the subscription, silently
// breaking push delivery for that user from then on.
function linkForNotification(type: NotificationType): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const path = (() => {
    switch (type) {
      case "GENERAL_ENQUIRY_RECEIVED":
        return "/admin/enquiries/general";
      case "REFERRAL_EARNED":
        return "/dashboard/referrals";
      case "PAYMENT_SUCCESS":
      case "PAYMENT_FAILURE":
      case "INSTALMENT_REMINDER":
        return "/dashboard/payments";
      case "REFUND_PROCESSED":
      case "ADMIN_MESSAGE":
        return "/dashboard/redeem";
      case "REGISTRATION":
      case "PLAN_MATURITY":
      case "PROMOTIONAL":
      default:
        return "/dashboard/notifications";
    }
  })();
  return `${base}${path}`;
}

export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      relatedEntityRef: input.relatedEntityRef,
    },
  });

  // §30: a push delivery failure must never roll back or duplicate the
  // Notification record above — it has already been committed.
  try {
    await sendFcmPush({
      userId: input.userId,
      title: input.title,
      body: input.message,
      type: input.type,
      notificationId: notification.id,
      relatedEntityRef: input.relatedEntityRef,
      link: linkForNotification(input.type),
    });
  } catch (err) {
    console.error("[notification] FCM push delivery failed", err);
  }

  return notification;
}
