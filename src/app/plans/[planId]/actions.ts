"use server";

import { redirect } from "next/navigation";
import { addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { simulateCreateMandate } from "@/lib/providers/razorpay";
import { processScheduledPayment } from "@/lib/payment-engine";
import { logAudit } from "@/lib/audit";
import { parseCadenceKey, isSameCadence, type Cadence } from "@/lib/range-generator";

export type SubscribeState = { error?: string } | undefined;

export async function subscribeToPlanAction(
  planId: string,
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const amountRaw = formData.get("amount");
  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Please select a valid amount" };
  }

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { interestMethod: true },
  });
  if (!plan || plan.status !== "ACTIVE") {
    return { error: "This plan is not available" };
  }
  const interestMethod = plan.interestMethod;

  const allowedAmounts = plan.presetAmounts.map((a) => Number(a));
  if (!allowedAmounts.includes(amount)) {
    return { error: "Selected amount is not offered for this plan" };
  }

  // BRD Rule XLIX: a recurring (MONTHLY) plan requires a duration/cadence
  // selection from the plan's admin-configured list; LUMPSUM stays a single
  // one-time payment with no cadence choice (Drafted Clarification — pending
  // client confirmation, BRD Rule XLVIII(d)).
  let cadence: Cadence = { unit: "MONTH", interval: 1 };
  if (plan.paymentFrequency === "MONTHLY") {
    const durationRaw = formData.get("duration");
    const parsedCadence = typeof durationRaw === "string" ? parseCadenceKey(durationRaw) : null;
    if (!parsedCadence) {
      return { error: "Please select a valid payment duration" };
    }
    const allowedCadences = (plan.paymentCadences as unknown as Cadence[]) ?? [];
    if (!allowedCadences.some((c) => isSameCadence(c, parsedCadence))) {
      return { error: "Selected payment duration is not offered for this plan" };
    }
    cadence = parsedCadence;
  }

  const userPlan = await prisma.userPlan.create({
    data: {
      userId: session.sub,
      planId: plan.id,
      interestMethodId: plan.interestMethodId,
      interestMethodVersion: interestMethod.version,
      rewardPercentSnapshot: plan.rewardPercent,
      commissionPercentSnapshot: plan.commissionPercent,
      paymentAmount: amount,
      paymentFrequency: plan.paymentFrequency,
      cadenceUnit: cadence.unit,
      cadenceInterval: cadence.interval,
      remainingUnpaidPrincipal: amount * plan.tenureMonths,
      maturityDate: addMonths(new Date(), plan.tenureMonths),
    },
  });

  const { gatewayMandateId } = await simulateCreateMandate();
  const mandate = await prisma.paymentMandate.create({
    data: {
      userPlanId: userPlan.id,
      gatewayMandateId,
      status: "ACTIVE",
    },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "PLAN_SUBSCRIBED",
    entityRef: userPlan.id,
  });

  await processScheduledPayment({
    userPlanId: userPlan.id,
    idempotencyKey: `first-payment-${userPlan.id}`,
    mandateId: mandate.id,
  });

  redirect("/dashboard");
}
