import { addDays, addWeeks, addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { processScheduledPayment } from "@/lib/payment-engine";
import type { SimulatedOutcome } from "@/lib/providers/razorpay";
import type { CadenceUnit } from "@prisma/client";

// BRD Rule XLVIII: a UserPlan's cadence (unit + interval) is snapshotted at
// subscribe time from the Plan's admin-configured paymentCadences list — this
// computes the next due date from that snapshot instead of a fixed month.
function addCadence(date: Date, unit: CadenceUnit, interval: number): Date {
  switch (unit) {
    case "DAY":
      return addDays(date, interval);
    case "WEEK":
      return addWeeks(date, interval);
    case "MONTH":
      return addMonths(date, interval);
  }
}

// Prototype AutoPay scheduler. There is no real cron/queue (Master Prompt:
// no Redis/Kafka/background job infra) — an admin explicitly triggers a
// "run due charges" action from the simulator screen, which stands in for
// the recurring AutoPay debit that Razorpay would normally fire on schedule.
export async function findDuePlans() {
  const activePlans = await prisma.userPlan.findMany({
    where: { status: "ACTIVE" },
    include: {
      payments: { orderBy: { createdAt: "desc" } },
      plan: true,
      mandates: { where: { status: "ACTIVE" }, take: 1 },
    },
  });

  const now = new Date();
  return activePlans.filter((up) => {
    if (up.paymentFrequency !== "MONTHLY") return false;
    if (up.mandates.length === 0) return false;
    if (Number(up.remainingUnpaidPrincipal) <= 0) return false;
    // BRD Rule XXVII: a scheduled instalment still under automatic retry, or
    // FAILED but still within its manual payment window, is not yet resolved
    // — don't schedule the next cycle's charge on top of it. Once the manual
    // window closes without payment, that instalment is permanently missed
    // and the schedule moves on (BRD: this does not suspend the Plan).
    const hasUnresolvedPayment = up.payments.some((p) => {
      if (p.status === "RETRYING") return true;
      if (p.status === "FAILED") return p.manualWindowEndsAt ? now <= p.manualWindowEndsAt : false;
      return false;
    });
    if (hasUnresolvedPayment) return false;
    const lastResolved = up.payments.find((p) => p.status === "SUCCESS" || p.status === "FAILED");
    const anchor = lastResolved ? lastResolved.createdAt : up.startDate;
    const nextDue = addCadence(anchor, up.cadenceUnit, up.cadenceInterval);
    return nextDue <= now;
  });
}

export async function runDueAutoPayCharges(forceOutcome?: SimulatedOutcome, forceInvalidSignature?: boolean) {
  const due = await findDuePlans();
  const results = [];
  for (const userPlan of due) {
    const paidCount = await prisma.payment.count({
      where: { userPlanId: userPlan.id, status: "SUCCESS" },
    });
    const cycleNumber = paidCount + 1;
    const payment = await processScheduledPayment({
      userPlanId: userPlan.id,
      idempotencyKey: `cycle-${cycleNumber}-${userPlan.id}`,
      mandateId: userPlan.mandates[0]?.id,
      forceOutcome,
      forceInvalidSignature,
    });
    results.push({
      userPlanId: userPlan.id,
      paymentId: payment?.id ?? null,
      status: payment?.status ?? "REJECTED_SIGNATURE",
    });
  }
  return results;
}
