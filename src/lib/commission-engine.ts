import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/config";
import { roundHalfUp } from "@/lib/money";
import { createNotification } from "@/lib/providers/notification";

// BRD Rule IX / XXXII: referral commission accrues on the referred user's
// successful payments *under the applicable plan* — a one-time commission on
// the first successful payment under that plan, and a recurring commission
// every N consecutive successful payments under that same plan thereafter.
// The cycle is scoped per userPlanId (per plan, for the plan's tenure), not
// across the referred user's other plans. Commissions start in ACCRUED
// status and move through the full lifecycle (ACCRUED -> APPROVED ->
// CREDITED -> AVAILABLE_FOR_WITHDRAWAL -> WITHDRAWN) via the admin approval
// queue in src/app/admin/commissions/actions.ts, so no ledger entry is
// posted here.
export async function accrueReferralCommissionForPayment(params: {
  referredUserId: string;
  userPlanId: string;
  paymentId: string;
  paymentAmount: number;
  commissionPercent: number;
}) {
  const { referredUserId, userPlanId, paymentId, paymentAmount, commissionPercent } = params;

  const referral = await prisma.referral.findUnique({
    where: { referredUserId },
  });
  if (!referral || referral.status !== "ACTIVE" || referral.expiryDate < new Date()) {
    return null;
  }

  const priorSuccessfulPaymentCount = await prisma.payment.count({
    where: {
      userPlanId,
      status: "SUCCESS",
      id: { not: paymentId },
    },
  });
  const paymentSequenceNumber = priorSuccessfulPaymentCount + 1;

  const { commissionRecurringCycleLength } = await getSettings();
  const commissionAmount = roundHalfUp((commissionPercent / 100) * paymentAmount, 2);
  const isFirstPayment = paymentSequenceNumber === 1;
  const isRecurringCyclePoint = paymentSequenceNumber % commissionRecurringCycleLength === 0;

  if (!isFirstPayment && !isRecurringCyclePoint) {
    return null;
  }

  const commission = await prisma.commission.create({
    data: {
      referralId: referral.id,
      userPlanId,
      paymentId,
      amount: commissionAmount,
      status: "ACCRUED",
      commissionType: isFirstPayment ? "ONE_TIME" : "RECURRING",
      cyclePosition: paymentSequenceNumber,
    },
  });

  await createNotification({
    userId: referral.referrerUserId,
    type: "REFERRAL_EARNED",
    title: "Referral commission accrued",
    message: `A commission of ₹${commissionAmount.toFixed(2)} has been accrued for your referral and is pending admin approval.`,
  });

  return commission;
}
