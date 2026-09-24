"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  approveRedemptionRequest,
  rejectRedemptionRequest,
  verifyRedemptionShortfall,
  expireStaleRedemptionRequests,
} from "@/lib/redemption-engine";
import { logAudit } from "@/lib/audit";
import { emitAdminEvent } from "@/lib/events/admin-events";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

export async function verifyShortfallAction(
  redemptionId: string,
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const session = await requireAdmin();
  const reference = String(formData.get("reference") ?? "").trim();
  if (!reference) return { error: "Enter a payment reference/receipt number." };

  await verifyRedemptionShortfall({ redemptionId, adminUserId: session.sub, reference });
  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTION_SHORTFALL_VERIFIED",
    entityRef: redemptionId,
    details: { reference },
  });
  revalidatePath("/admin/redemptions");
}

export async function approveRedemptionAction(redemptionId: string): Promise<void> {
  const session = await requireAdmin();
  await approveRedemptionRequest(redemptionId, session.sub);
  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTION_APPROVED",
    entityRef: redemptionId,
  });
  revalidatePath("/admin/redemptions");
}

export async function rejectRedemptionAction(
  redemptionId: string,
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const session = await requireAdmin();
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  await rejectRedemptionRequest(redemptionId, session.sub, reason);
  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTION_REJECTED",
    entityRef: redemptionId,
    details: reason ? { reason } : undefined,
  });
  revalidatePath("/admin/redemptions");
  return undefined;
}

export async function approveFranchiseeEnquiryAction(enquiryId: string): Promise<void> {
  const session = await requireAdmin();
  const enquiry = await prisma.franchiseeRedemptionEnquiry.findUniqueOrThrow({
    where: { id: enquiryId },
  });
  if (enquiry.status === "AWAITING_SHORTFALL_RESOLUTION" && !enquiry.shortfallVerifiedAt) {
    throw new Error("Shortfall must be verified before approval");
  }

  await prisma.$transaction(async (tx) => {
    // BRD Rule XXIV/Money Mechanics: the shortfall portion is resolved
    // offline and never touches the ledger.
    const internalPortion = Number(enquiry.requestedAmount) - Number(enquiry.shortfallAmount);

    if (internalPortion > 0) {
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { userId: enquiry.userId },
        orderBy: { transactionTimestamp: "desc" },
      });
      const balanceBefore = lastEntry ? Number(lastEntry.balanceAfter) : 0;

      // BRD Rule III: re-verify at approval time that this debit does not dip
      // into principal still locked in an unmatured plan (see the identical
      // checkpoint in approveRedemptionRequest in redemption-engine.ts).
      const unmaturedPlans = await tx.userPlan.findMany({
        where: { userId: enquiry.userId, status: { in: ["ACTIVE", "DISCONTINUED"] } },
        select: { principalPaid: true },
      });
      const lockedPrincipal = unmaturedPlans.reduce((sum, up) => sum + Number(up.principalPaid), 0);
      const maxRedeemable = Math.max(0, balanceBefore - lockedPrincipal);
      if (internalPortion > maxRedeemable) {
        throw new Error(
          "Cannot approve: requested amount exceeds redeemable balance because part of the user's principal is still locked in an unmatured plan (BRD Rule III).",
        );
      }

      const balanceAfter = balanceBefore - internalPortion;

      await tx.ledgerEntry.create({
        data: {
          userId: enquiry.userId,
          transactionType: "REDEMPTION_FRANCHISEE",
          amount: -internalPortion,
          balanceBefore,
          balanceAfter,
          approverUserId: session.sub,
          approvalTimestamp: new Date(),
          description: `Franchisee redemption approved (${enquiry.id})`,
        },
      });
    }

    await tx.franchiseeRedemptionEnquiry.update({
      where: { id: enquiryId },
      data: { status: "APPROVED" },
    });

    await tx.notification.create({
      data: {
        userId: enquiry.userId,
        type: "REFUND_PROCESSED",
        title: "Franchisee enquiry approved",
        message: `Your franchisee redemption of ₹${Number(enquiry.requestedAmount).toFixed(2)} has been approved and processed.`,
      },
    });
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "FRANCHISEE_ENQUIRY_APPROVED",
    entityRef: enquiryId,
  });
  revalidatePath("/admin/redemptions");
}

export async function rejectFranchiseeEnquiryAction(enquiryId: string): Promise<void> {
  const session = await requireAdmin();
  const enquiry = await prisma.franchiseeRedemptionEnquiry.update({
    where: { id: enquiryId },
    data: { status: "REJECTED" },
  });
  await prisma.notification.create({
    data: {
      userId: enquiry.userId,
      type: "ADMIN_MESSAGE",
      title: "Franchisee enquiry rejected",
      message: `Your franchisee redemption enquiry of ₹${Number(enquiry.requestedAmount).toFixed(2)} was rejected by the Admin.`,
    },
  });
  await logAudit({
    actorUserId: session.sub,
    eventType: "FRANCHISEE_ENQUIRY_REJECTED",
    entityRef: enquiryId,
  });
  revalidatePath("/admin/redemptions");
}

export async function expireStaleRedemptionsAction(): Promise<void> {
  const session = await requireAdmin();
  const count = await expireStaleRedemptionRequests();
  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTIONS_EXPIRED_BATCH_RUN",
    entityRef: `count:${count}`,
  });
  emitAdminEvent({
    type: "redemptions_expired.batch_run",
    message: `Redemption expiry batch run completed (${count} request${count === 1 ? "" : "s"} expired)`,
    details: { count },
  });
  revalidatePath("/admin/redemptions");
}

export async function verifyFranchiseeShortfallAction(
  enquiryId: string,
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const session = await requireAdmin();
  const reference = String(formData.get("reference") ?? "").trim();
  if (!reference) return { error: "Enter a payment reference/receipt number." };

  await prisma.franchiseeRedemptionEnquiry.update({
    where: { id: enquiryId },
    data: {
      shortfallReference: reference,
      shortfallVerifiedBy: session.sub,
      shortfallVerifiedAt: new Date(),
    },
  });
  await logAudit({
    actorUserId: session.sub,
    eventType: "FRANCHISEE_SHORTFALL_VERIFIED",
    entityRef: enquiryId,
    details: { reference },
  });
  revalidatePath("/admin/redemptions");
}
