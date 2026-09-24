import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// BRD Rule XLII: shared by both the User (/dashboard/account) and Admin
// (/admin/account) opt-out toggles — a single place that keeps the
// preference flag, the subscription revocation, and the audit trail in
// sync, regardless of which role is disabling/enabling push.
export async function setPushNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { pushNotificationsEnabled: enabled } });

  if (!enabled) {
    // Revoke every currently-active registration so no in-flight token can
    // still receive a push after opting out, even if sendFcmPush()'s own
    // preference check (defense in depth) were ever bypassed.
    await prisma.pushSubscription.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await logAudit({
    actorUserId: userId,
    eventType: enabled ? "PUSH_NOTIFICATIONS_ENABLED" : "PUSH_NOTIFICATIONS_DISABLED",
    entityRef: userId,
  });
}
