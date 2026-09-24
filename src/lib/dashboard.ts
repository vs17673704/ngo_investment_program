import { prisma } from "@/lib/prisma";
import { getRedeemableBalance } from "@/lib/redemption-engine";
import type { UserPlan } from "@prisma/client";

// Design.md 5.13 "Next Deduction": next scheduled instalment amount/date for
// a MONTHLY plan still accruing (LUMPSUM has no further deductions after the
// single upfront payment). Derived live from principalPaid — never a stored
// "next date" field — so it stays correct across manual/retry payment paths.
export function computeNextDeduction(
  userPlan: Pick<UserPlan, "status" | "paymentFrequency" | "paymentAmount" | "principalPaid" | "startDate" | "maturityDate">,
): { amount: number; date: Date } | null {
  if (userPlan.paymentFrequency !== "MONTHLY") return null;
  if (userPlan.status !== "ACTIVE" && userPlan.status !== "DISCONTINUED") return null;

  const paymentAmount = Number(userPlan.paymentAmount);
  if (paymentAmount <= 0) return null;
  const instalmentsPaid = Math.round(Number(userPlan.principalPaid) / paymentAmount);

  const nextDate = new Date(userPlan.startDate);
  nextDate.setMonth(nextDate.getMonth() + instalmentsPaid + 1);
  if (nextDate > userPlan.maturityDate) return null;

  return { amount: paymentAmount, date: nextDate };
}

export async function getUserDashboardData(userId: string) {
  const [user, userPlans, redeemableBalance, interestAgg, commissionAgg, unreadNotificationCount] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.userPlan.findMany({
        where: { userId },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
      getRedeemableBalance(userId),
      prisma.ledgerEntry.aggregate({
        where: { userId, transactionType: "INTEREST" },
        _sum: { amount: true },
      }),
      prisma.commission.aggregate({
        where: {
          referral: { referrerUserId: userId },
          status: { in: ["CREDITED", "AVAILABLE_FOR_WITHDRAWAL", "WITHDRAWN"] },
        },
        _sum: { amount: true },
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

  const totalInvested = userPlans.reduce(
    (sum, up) => sum + Number(up.principalPaid),
    0,
  );
  const activePlans = userPlans.filter((up) => up.status === "ACTIVE");
  const closedPlans = userPlans.filter((up) =>
    ["MATURED", "REDEEMED", "DISCONTINUED"].includes(up.status),
  );

  return {
    user,
    userPlans,
    totalInvested,
    activePlanCount: activePlans.length,
    closedPlanCount: closedPlans.length,
    redeemableBalance,
    totalInterest: Number(interestAgg._sum.amount ?? 0),
    rewardPoints: user.rewardPointsBalance,
    referralEarnings: Number(commissionAgg._sum.amount ?? 0),
    unreadNotificationCount,
  };
}

// Lightweight companion to getUserDashboardData, for src/app/dashboard/layout.tsx:
// the shell only ever needs these 3 fields, and fetching the full dashboard
// (6 parallel queries) just for shell chrome would run on every request the
// layout serves rather than once per page's own content need.
export async function getDashboardShellData(userId: string) {
  const [user, unreadNotificationCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, referralCode: true },
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return { email: user.email, referralCode: user.referralCode, unreadNotificationCount };
}

// BRD Dashboard Commission Metrics: Referral Payout (admin) = sum of
// commissions where status = WITHDRAWN only. All figures derived live from
// ledger/commission records, never a manually-maintained balance field.
export async function getAdminDashboardData() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    referralPayoutAgg,
    revenueAgg,
    failedPaymentCount,
    todaysPaymentAgg,
    pendingRefundCount,
    upcomingMaturityCount,
  ] = await Promise.all([
    prisma.commission.aggregate({ where: { status: "WITHDRAWN" }, _sum: { amount: true } }),
    prisma.ledgerEntry.aggregate({
      where: { transactionType: "PLAN_PAYMENT" },
      _sum: { amount: true },
    }),
    prisma.payment.count({ where: { status: "FAILED" } }),
    prisma.payment.aggregate({
      where: { status: "SUCCESS", actualDate: { gte: startOfToday } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.redemptionRequest.count({
      where: { category: "REFUND", status: { in: ["PENDING", "AWAITING_SHORTFALL_RESOLUTION"] } },
    }),
    prisma.userPlan.count({
      where: {
        status: { in: ["ACTIVE", "DISCONTINUED"] },
        maturityDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) },
      },
    }),
  ]);

  return {
    referralPayout: Number(referralPayoutAgg._sum.amount ?? 0),
    revenue: Number(revenueAgg._sum.amount ?? 0),
    failedPaymentCount,
    todaysPaymentCount: todaysPaymentAgg._count,
    todaysPaymentTotal: Number(todaysPaymentAgg._sum.amount ?? 0),
    pendingRefundCount,
    upcomingMaturityCount,
  };
}
