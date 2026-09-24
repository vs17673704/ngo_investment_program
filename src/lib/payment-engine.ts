import { prisma } from "@/lib/prisma";
import {
  simulateChargePayment,
  simulateCreateOrder,
  verifyWebhookSignature,
  type SimulatedOutcome,
} from "@/lib/providers/razorpay";
import { accrueReferralCommissionForPayment } from "@/lib/commission-engine";
import { queueEmail } from "@/lib/providers/email";
import { createNotification } from "@/lib/providers/notification";
import { getSettings } from "@/lib/config";
import { logAudit } from "@/lib/audit";
import { emitAdminEvent } from "@/lib/events/admin-events";
import { roundHalfUp } from "@/lib/money";
import { Prisma, type Payment, type UserPlan, type Plan } from "@prisma/client";

// Shared post-success handling: posts the PLAN_PAYMENT ledger entry, updates
// the UserPlan running totals, and triggers email/notification/commission —
// used identically whether the payment succeeded on the first attempt, on an
// automatic retry, or via the manual payment fallback (BRD Rule XXVII: "A
// manual payment successfully received within this configured window shall
// be treated as a successful payment for the corresponding scheduled
// instalment and shall be recorded in the Unified Financial Ledger").
async function postSuccessfulPayment(payment: Payment, userPlan: UserPlan & { plan: Plan }) {
  const amount = Number(userPlan.paymentAmount);

  await prisma.$transaction(async (tx) => {
    const lastEntry = await tx.ledgerEntry.findFirst({
      where: { userId: userPlan.userId },
      orderBy: { transactionTimestamp: "desc" },
    });
    const balanceBefore = lastEntry ? Number(lastEntry.balanceAfter) : 0;
    // Round Half Up per BRD Rule XXXIII/XXXIV: adding two already-rounded
    // 2-decimal values can still produce IEEE-754 noise (e.g. 0.1 + 0.2),
    // which would otherwise persist into the ledger's stored balance.
    const balanceAfter = roundHalfUp(balanceBefore + amount);

    await tx.ledgerEntry.create({
      data: {
        userId: userPlan.userId,
        userPlanId: userPlan.id,
        paymentId: payment.id,
        transactionType: "PLAN_PAYMENT",
        amount,
        balanceBefore,
        balanceAfter,
        description: `Instalment payment for ${userPlan.plan.name}`,
      },
    });

    await tx.userPlan.update({
      where: { id: userPlan.id },
      data: {
        principalPaid: { increment: amount },
        remainingUnpaidPrincipal: { decrement: amount },
      },
    });
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userPlan.userId } });

  await queueEmail({
    recipient: user.email,
    subject: "Payment Successful",
    body: `Your payment of ₹${amount.toFixed(2)} for ${userPlan.plan.name} was successful.`,
    templateType: "PAYMENT_RECEIPT",
    relatedEntityRef: payment.id,
  });

  await createNotification({
    userId: userPlan.userId,
    type: "PAYMENT_SUCCESS",
    title: "Payment successful",
    message: `Your payment of ₹${amount.toFixed(2)} was received.`,
  });

  await accrueReferralCommissionForPayment({
    referredUserId: userPlan.userId,
    userPlanId: userPlan.id,
    paymentId: payment.id,
    paymentAmount: amount,
    commissionPercent: Number(userPlan.commissionPercentSnapshot),
  });
}

// Processes one scheduled AutoPay charge for a UserPlan: creates the Payment
// + PaymentEvent rows via the simulated Razorpay provider. On success, posts
// the ledger entry immediately. On failure, enters the BRD Rule XXVII retry
// lifecycle (RETRYING, with a grace-period deadline and next-retry time)
// rather than failing the instalment outright. Idempotent per idempotencyKey.
export async function processScheduledPayment(params: {
  userPlanId: string;
  idempotencyKey: string;
  mandateId?: string;
  forceOutcome?: SimulatedOutcome;
  forceInvalidSignature?: boolean;
}): Promise<Payment | null> {
  // BRD Rule XXXVI.1: idempotency-key dedupe at payment-initiation time, before
  // any gateway interaction — distinct from Rule XXXVI.5's webhook-signature
  // ordering below, which governs a separate, already-in-flight gateway event.
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });
  if (existing) return existing;

  const userPlan = await prisma.userPlan.findUniqueOrThrow({
    where: { id: params.userPlanId },
    include: { plan: true },
  });

  const settings = await getSettings();
  const { gatewayOrderId } = await simulateCreateOrder();
  const charge = await simulateChargePayment(params.forceOutcome, params.forceInvalidSignature);

  // BRD Rule XXXVI.5: signature verification happens before duplicate
  // detection or any other processing; on failure, reject and create no
  // financial transaction, balance update, or commission.
  if (!verifyWebhookSignature(charge.rawPayload, charge.signature)) {
    await logAudit({
      eventType: "WEBHOOK_SIGNATURE_INVALID",
      entityRef: userPlan.id,
      details: { gatewayEventId: charge.gatewayEventId },
    });
    emitAdminEvent({
      type: "webhook.signature_invalid",
      message: "Invalid webhook signature detected during scheduled payment processing",
      details: { userPlanId: userPlan.id, gatewayEventId: charge.gatewayEventId },
    });
    return null;
  }

  const scheduledDate = new Date();

  let payment: Payment;
  try {
    payment = await prisma.payment.create({
      data: {
        userPlanId: userPlan.id,
        mandateId: params.mandateId,
        idempotencyKey: params.idempotencyKey,
        gatewayOrderId,
        gatewayPaymentId: charge.gatewayPaymentId,
        status: charge.outcome === "SUCCESS" ? "SUCCESS" : "RETRYING",
        amount: userPlan.paymentAmount,
        method: userPlan.preferredPaymentMethod,
        scheduledDate,
        actualDate: charge.outcome === "SUCCESS" ? new Date() : null,
        gracePeriodEndsAt:
          charge.outcome === "SUCCESS"
            ? null
            : new Date(scheduledDate.getTime() + settings.paymentGracePeriodHours * 3600_000),
        nextRetryAt:
          charge.outcome === "SUCCESS"
            ? null
            : new Date(scheduledDate.getTime() + settings.paymentRetryIntervalHours * 3600_000),
      },
    });
  } catch (err) {
    // BRD Rule XXXVI.7 (Concurrent Request Protection): a concurrent call with
    // the same idempotency key can race past the findUnique check above and
    // hit the DB-level unique constraint. Treat that as the duplicate it is —
    // return the winning transaction instead of surfacing a raw DB error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.payment.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (winner) return winner;
    }
    throw err;
  }

  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      eventType: charge.outcome === "SUCCESS" ? "payment.captured" : "payment.failed",
      gatewayEventId: charge.gatewayEventId,
      signatureVerified: true,
      rawPayload: { simulated: true, outcome: charge.outcome, attempt: 0 },
    },
  });

  if (charge.outcome !== "SUCCESS") {
    await queueEmail({
      recipient: (await prisma.user.findUniqueOrThrow({ where: { id: userPlan.userId } })).email,
      subject: "Payment Failed",
      body: `Your scheduled payment of ₹${Number(userPlan.paymentAmount).toFixed(2)} for ${userPlan.plan.name} could not be processed. We will automatically retry.`,
      templateType: "PAYMENT_RECEIPT",
      relatedEntityRef: payment.id,
    });
    await createNotification({
      userId: userPlan.userId,
      type: "PAYMENT_FAILURE",
      title: "Payment failed",
      message: `Your scheduled payment of ₹${Number(userPlan.paymentAmount).toFixed(2)} could not be processed. We will automatically retry.`,
    });
    return payment;
  }

  await postSuccessfulPayment(payment, userPlan);
  return payment;
}

// BRD Rule XXVII: retries a payment currently in RETRYING status whose
// nextRetryAt has arrived. Stops retrying (moves to terminal FAILED and opens
// the manual payment window) once the max retry count is reached or the
// grace period has expired, whichever occurs first.
export async function retryDuePayment(
  paymentId: string,
  forceOutcome?: SimulatedOutcome,
  forceInvalidSignature?: boolean,
) {
  const settings = await getSettings();
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { userPlan: { include: { plan: true } } },
  });

  if (payment.status !== "RETRYING") return payment;

  const now = new Date();
  const attemptNumber = payment.retryCount + 1;
  const charge = await simulateChargePayment(forceOutcome, forceInvalidSignature);

  if (!verifyWebhookSignature(charge.rawPayload, charge.signature)) {
    await logAudit({
      eventType: "WEBHOOK_SIGNATURE_INVALID",
      entityRef: payment.id,
      details: { gatewayEventId: charge.gatewayEventId },
    });
    emitAdminEvent({
      type: "webhook.signature_invalid",
      message: "Invalid webhook signature detected during payment retry",
      details: { paymentId: payment.id, gatewayEventId: charge.gatewayEventId },
    });
    return payment;
  }

  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      eventType: charge.outcome === "SUCCESS" ? "payment.captured" : "payment.failed",
      gatewayEventId: charge.gatewayEventId,
      signatureVerified: true,
      rawPayload: { simulated: true, outcome: charge.outcome, attempt: attemptNumber },
    },
  });

  if (charge.outcome === "SUCCESS") {
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCESS",
        gatewayPaymentId: charge.gatewayPaymentId,
        actualDate: now,
        retryCount: attemptNumber,
        nextRetryAt: null,
      },
    });
    await postSuccessfulPayment(updated, payment.userPlan);
    return updated;
  }

  const gracePeriodExpired = payment.gracePeriodEndsAt ? now >= payment.gracePeriodEndsAt : false;
  const retriesExhausted = attemptNumber >= settings.paymentRetryCount;

  if (retriesExhausted || gracePeriodExpired) {
    const manualWindowEndsAt = new Date(now.getTime() + settings.manualPaymentWindowHours * 3600_000);
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        retryCount: attemptNumber,
        nextRetryAt: null,
        manualWindowEndsAt,
      },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: payment.userPlan.userId } });
    await queueEmail({
      recipient: user.email,
      subject: "Automatic Payment Recovery Ended",
      body: `We were unable to automatically collect your instalment of ₹${Number(payment.amount).toFixed(2)} for ${payment.userPlan.plan.name}. You can complete this payment manually within ${settings.manualPaymentWindowHours} hours.`,
      templateType: "PAYMENT_RECEIPT",
      relatedEntityRef: payment.id,
    });
    await createNotification({
      userId: payment.userPlan.userId,
      type: "PAYMENT_FAILURE",
      title: "Manual payment required",
      message: `Automatic retries for your ₹${Number(payment.amount).toFixed(2)} instalment are exhausted. Please complete it manually within ${settings.manualPaymentWindowHours} hours.`,
    });
    return updated;
  }

  return prisma.payment.update({
    where: { id: payment.id },
    data: {
      retryCount: attemptNumber,
      nextRetryAt: new Date(now.getTime() + settings.paymentRetryIntervalHours * 3600_000),
    },
  });
}

export async function findDuePaymentRetries() {
  return prisma.payment.findMany({
    where: { status: "RETRYING", nextRetryAt: { lte: new Date() } },
    include: { userPlan: { include: { user: true, plan: true } } },
  });
}

export async function runDuePaymentRetries(forceOutcome?: SimulatedOutcome, forceInvalidSignature?: boolean) {
  const due = await findDuePaymentRetries();
  const results = [];
  for (const payment of due) {
    const updated = await retryDuePayment(payment.id, forceOutcome, forceInvalidSignature);
    results.push({ paymentId: updated.id, status: updated.status });
  }
  return results;
}

// BRD Rule XXVII Manual Payment Fallback: the user completes a FAILED
// instalment manually, but only within the configured manual payment window
// measured from the point automatic recovery ended. A manual payment
// received after the window has closed must NOT be treated as successful for
// that scheduled instalment.
export async function submitManualPayment(paymentId: string, userId: string) {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { userPlan: { include: { plan: true } } },
  });

  if (payment.userPlan.userId !== userId) throw new Error("Forbidden");
  if (payment.status !== "FAILED") {
    throw new Error("This payment is not awaiting manual completion");
  }
  if (!payment.manualWindowEndsAt || new Date() > payment.manualWindowEndsAt) {
    throw new Error("The manual payment window for this instalment has expired");
  }

  const charge = await simulateChargePayment("SUCCESS");
  if (!verifyWebhookSignature(charge.rawPayload, charge.signature)) {
    await logAudit({
      eventType: "WEBHOOK_SIGNATURE_INVALID",
      entityRef: payment.id,
      details: { gatewayEventId: charge.gatewayEventId },
    });
    emitAdminEvent({
      type: "webhook.signature_invalid",
      message: "Invalid webhook signature detected during manual payment submission",
      details: { paymentId: payment.id, gatewayEventId: charge.gatewayEventId },
    });
    throw new Error("Payment could not be verified. Please try again.");
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "SUCCESS",
      gatewayPaymentId: charge.gatewayPaymentId,
      actualDate: new Date(),
    },
  });

  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      eventType: "payment.captured",
      gatewayEventId: charge.gatewayEventId,
      signatureVerified: true,
      rawPayload: { simulated: true, outcome: "SUCCESS", manual: true },
    },
  });

  await postSuccessfulPayment(updated, payment.userPlan);
  return updated;
}
