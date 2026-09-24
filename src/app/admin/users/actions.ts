"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

export async function toggleUserLockAction(userId: string): Promise<void> {
  const session = await requireAdmin();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const locked = !!user.lockedUntil && user.lockedUntil > new Date();

  await prisma.user.update({
    where: { id: userId },
    data: locked
      ? { lockedUntil: null, failedLoginCount: 0 }
      : { lockedUntil: new Date("2099-12-31") },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: locked ? "USER_UNLOCKED" : "USER_LOCKED",
    entityRef: userId,
  });
  revalidatePath("/admin/users");
}

export async function toggleReferralCodeActiveAction(userId: string): Promise<void> {
  const session = await requireAdmin();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  await prisma.user.update({
    where: { id: userId },
    data: { referralCodeActive: !user.referralCodeActive },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: user.referralCodeActive ? "REFERRAL_CODE_DEACTIVATED" : "REFERRAL_CODE_ACTIVATED",
    entityRef: userId,
  });
  revalidatePath("/admin/users");
}

export type CancelReferralState = { error?: string } | undefined;

// BRD Rule XX: an admin may cancel an active referral relationship, stating a
// reason. Cancellation only stops *future* commission accrual (enforced by
// commission-engine.ts's `referral.status !== "ACTIVE"` gate) — it never
// marks already-accrued/approved commission as CANCELLED or reverses it
// (BRD Rule XXI, non-reversible commission).
export async function cancelReferralAction(
  referralId: string,
  _prev: CancelReferralState,
  formData: FormData,
): Promise<CancelReferralState> {
  const session = await requireAdmin();
  const reason = formData.get("reason")?.toString().trim();
  if (!reason) {
    return { error: "A cancellation reason is required" };
  }

  const referral = await prisma.referral.findUniqueOrThrow({ where: { id: referralId } });
  if (referral.status !== "ACTIVE") {
    return { error: "Only an active referral relationship can be cancelled" };
  }

  await prisma.referral.update({
    where: { id: referralId },
    data: {
      status: "CANCELLED",
      cancellationReason: reason,
      cancelledBy: session.sub,
      cancelledAt: new Date(),
    },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "REFERRAL_CANCELLED",
    entityRef: referralId,
    details: { reason },
  });
  revalidatePath("/admin/referrers");
}
