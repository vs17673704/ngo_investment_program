import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import type { NotificationType } from "@prisma/client";

// Master Prompt.md §24/§26: real Firebase Cloud Messaging delivery, server
// side only. Called from src/lib/providers/notification.ts right after the
// durable Notification DB record is written — FCM is only the transport;
// the Notification row remains the application's notification history
// regardless of whether the push actually reaches a device (§30).

export type FcmPushInput = {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  notificationId: string;
  relatedEntityRef?: string;
  link?: string;
};

// §32: only safe, non-sensitive fields ever leave this process in the push
// payload — never passwords/OTPs/tokens/credentials.
export async function sendFcmPush(input: FcmPushInput): Promise<void> {
  // BRD Rule XLII: push opt-out only ever gates this delivery step — the
  // Notification DB row (§30) is already written by the caller regardless.
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { pushNotificationsEnabled: true },
  });
  if (!user?.pushNotificationsEnabled) return;

  const registrations = await prisma.pushSubscription.findMany({
    where: { userId: input.userId, revokedAt: null },
  });
  if (registrations.length === 0) return;

  let messaging;
  try {
    messaging = getMessaging(getFirebaseAdminApp());
  } catch (err) {
    // §30: FCM being unconfigured/unreachable must never roll back or
    // duplicate the already-persisted Notification record.
    console.error("[fcm] Firebase Admin unavailable, skipping push delivery", err);
    return;
  }

  // §31: multi-device — send to every currently-active registration for
  // this account, but this is still exactly one business notification.
  await Promise.all(
    registrations.map(async (registration) => {
      try {
        await messaging.send({
          token: registration.fcmToken,
          notification: { title: input.title, body: input.body },
          data: {
            type: input.type,
            notificationId: input.notificationId,
            ...(input.relatedEntityRef ? { relatedEntityRef: input.relatedEntityRef } : {}),
            ...(input.link ? { link: input.link } : {}),
          },
          webpush: {
            fcmOptions: input.link ? { link: input.link } : undefined,
          },
        });
      } catch (err) {
        const code = (err as { code?: string } | null)?.code ?? "unknown";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          // §26/§30: deactivate stale registrations instead of retrying
          // them forever. Deliberately excludes messaging/invalid-argument:
          // that code means the SEND PAYLOAD was malformed (e.g. a bad
          // webpush.fcmOptions.link — see linkForNotification in
          // notification.ts), not that this token is dead. Revoking a valid
          // token on a payload error was the root cause of every admin
          // token being silently wiped out after one enquiry notification.
          await prisma.pushSubscription
            .update({ where: { id: registration.id }, data: { revokedAt: new Date(), lastError: code } })
            .catch(() => {});
        } else {
          // Transient provider failure: keep the registration active, just
          // record safe diagnostics (§26) — no uncontrolled retry loop (§30).
          await prisma.pushSubscription
            .update({ where: { id: registration.id }, data: { lastError: code } })
            .catch(() => {});
        }
      }
    }),
  );
}
