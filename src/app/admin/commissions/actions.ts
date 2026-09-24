"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/providers/notification";

// BRD Commission Lifecycle (Flow 17): ACCRUED -> APPROVED -> CREDITED ->
// AVAILABLE_FOR_WITHDRAWAL -> WITHDRAWN. Approval is the non-reversible
// checkpoint (Rule XXI: commission is non-reversible once APPROVED) — after
// this step the commission can no longer be rejected. No ledger entry is
// posted at this step; the unified ledger entry (Rule XXXI) is posted at
// the CREDITED step, in creditCommissionAction below.
export async function approveCommissionAction(commissionId: string) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const commission = await prisma.commission.findUniqueOrThrow({ where: { id: commissionId } });
  if (commission.status !== "ACCRUED") {
    throw new Error("Commission is not in an approvable state");
  }

  await prisma.commission.update({
    where: { id: commissionId },
    data: { status: "APPROVED", approvalDate: new Date() },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "COMMISSION_APPROVED",
    entityRef: commission.id,
  });

  revalidatePath("/admin/commissions");
}

// BRD Rule XXXI (Unified Ledger Model): commission transactions must be
// recorded in the ONE unified ledger and contribute to the referrer's
// redeemable/available balance — no separate Commission Ledger is permitted.
// Crediting posts that ledger entry and makes the commission immediately
// available for withdrawal (this prototype treats CREDITED and AVAILABLE_FOR_
// WITHDRAWAL as one atomic admin action; creditDate is recorded either way).
export async function creditCommissionAction(commissionId: string) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const commission = await prisma.commission.findUniqueOrThrow({
    where: { id: commissionId },
    include: { referral: true },
  });
  if (commission.status !== "APPROVED") {
    throw new Error("Commission must be approved before it can be credited");
  }

  const referrerId = commission.referral.referrerUserId;
  const amount = Number(commission.amount);

  await prisma.$transaction(async (tx) => {
    const lastEntry = await tx.ledgerEntry.findFirst({
      where: { userId: referrerId },
      orderBy: { transactionTimestamp: "desc" },
    });
    const balanceBefore = lastEntry ? Number(lastEntry.balanceAfter) : 0;
    const balanceAfter = balanceBefore + amount;

    await tx.ledgerEntry.create({
      data: {
        userId: referrerId,
        transactionType: "COMMISSION",
        amount,
        balanceBefore,
        balanceAfter,
        referrerUserId: referrerId,
        commissionId: commission.id,
        approverUserId: session.sub,
        approvalTimestamp: new Date(),
        description: `Referral commission (${commission.commissionType}) credited`,
      },
    });

    await tx.commission.update({
      where: { id: commission.id },
      data: { status: "AVAILABLE_FOR_WITHDRAWAL", creditDate: new Date() },
    });
  });

  await createNotification({
    userId: referrerId,
    type: "REFERRAL_EARNED",
    title: "Referral commission credited",
    message: `Your commission of ₹${amount.toFixed(2)} has been credited and is now available for withdrawal.`,
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "COMMISSION_CREDITED",
    entityRef: commission.id,
  });

  revalidatePath("/admin/commissions");
  revalidatePath("/dashboard/referrals");
}

// Rule XXI: only an ACCRUED commission (not yet approved) may be rejected —
// once APPROVED a commission is non-reversible.
export async function rejectCommissionAction(commissionId: string) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const commission = await prisma.commission.findUniqueOrThrow({ where: { id: commissionId } });
  if (commission.status !== "ACCRUED") {
    throw new Error("Commission is not in a rejectable state");
  }

  await prisma.commission.update({
    where: { id: commissionId },
    data: { status: "NOT_ACCRUED" },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "COMMISSION_REJECTED",
    entityRef: commission.id,
  });

  revalidatePath("/admin/commissions");
}

// User-facing action: AVAILABLE_FOR_WITHDRAWAL -> WITHDRAWN. This does not
// move money out of the platform (no external payout gateway in this
// prototype) — it marks the commission as withdrawn and sets withdrawalDate,
// matching the BRD's terminal lifecycle state, and stops it from counting
// toward "Referral Earnings" while still counting toward Admin's "Referral
// Payout" metric (sum of WITHDRAWN).
export async function withdrawCommissionAction(commissionId: string) {
  const session = await getSession();
  if (!session) throw new Error("Forbidden");

  const commission = await prisma.commission.findUniqueOrThrow({
    where: { id: commissionId },
    include: { referral: true },
  });

  if (commission.referral.referrerUserId !== session.sub) {
    throw new Error("Forbidden");
  }
  if (commission.status !== "AVAILABLE_FOR_WITHDRAWAL") {
    throw new Error("Commission is not available for withdrawal");
  }

  await prisma.commission.update({
    where: { id: commissionId },
    data: { status: "WITHDRAWN", withdrawalDate: new Date() },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "COMMISSION_WITHDRAWN",
    entityRef: commission.id,
  });

  revalidatePath("/dashboard/referrals");
}
