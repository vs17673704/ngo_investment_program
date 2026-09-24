import { test, expect } from "playwright/test";
import { prisma, uniqueSuffix } from "../helpers";
import { createDuePaymentMandate } from "../browser/fixtures";
import { processScheduledPayment } from "../../src/lib/payment-engine";

// BRD Rule XXXVI ("Concurrent/Duplicate Webhook Handling"): duplicate and
// invalid-signature webhook races have no UI surface to drive at all — the
// simulated Razorpay provider (src/lib/providers/razorpay.ts) has no
// real gateway/webhook HTTP route in this app (confirmed: the entire
// simulated payment-provider surface is the /admin/payments buttons, which
// always drive a fresh charge, never resubmit a raw webhook payload). This is
// therefore an engine-level test against processScheduledPayment directly,
// per this project's own established exemption for flows with no UI action
// to exercise (see commission-cycle-scoping.spec.ts, relocated alongside this
// file for the same reason).
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("BRD Rule XXXVI.1: a duplicate idempotencyKey returns the original payment without double-processing the ledger", async () => {
  const { userPlan } = await createDuePaymentMandate();
  const idempotencyKey = `pw-idem-${uniqueSuffix()}`;

  const first = await processScheduledPayment({ userPlanId: userPlan.id, idempotencyKey, forceOutcome: "SUCCESS" });
  expect(first).not.toBeNull();
  expect(first!.status).toBe("SUCCESS");

  const second = await processScheduledPayment({ userPlanId: userPlan.id, idempotencyKey, forceOutcome: "SUCCESS" });
  expect(second).not.toBeNull();
  expect(second!.id).toBe(first!.id);

  const payments = await prisma.payment.findMany({ where: { userPlanId: userPlan.id } });
  expect(payments).toHaveLength(1);

  const ledgerEntries = await prisma.ledgerEntry.findMany({ where: { paymentId: first!.id } });
  expect(ledgerEntries).toHaveLength(1);

  const updatedPlan = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  // Confirms the second call never re-ran postSuccessfulPayment: principalPaid
  // reflects exactly one instalment, not two.
  expect(Number(updatedPlan.principalPaid)).toBe(Number(userPlan.paymentAmount));

  await prisma.ledgerEntry.deleteMany({ where: { userId: userPlan.userId } });
  await prisma.paymentEvent.deleteMany({ where: { paymentId: first!.id } });
  await prisma.payment.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.paymentMandate.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.userPlan.deleteMany({ where: { id: userPlan.id } });
});

test("BRD Rule XXXVI.7: two concurrent requests sharing one idempotencyKey race safely to a single winning payment", async () => {
  const { userPlan } = await createDuePaymentMandate();
  const idempotencyKey = `pw-idem-race-${uniqueSuffix()}`;

  // Both calls pass the same pre-generated idempotencyKey and start from a
  // state where neither has yet seen the other's row — reproducing the race
  // processScheduledPayment's P2002 catch block exists to handle, rather than
  // relying on incidental JS-event-loop timing to hit it.
  const [resultA, resultB] = await Promise.all([
    processScheduledPayment({ userPlanId: userPlan.id, idempotencyKey, forceOutcome: "SUCCESS" }),
    processScheduledPayment({ userPlanId: userPlan.id, idempotencyKey, forceOutcome: "SUCCESS" }),
  ]);

  expect(resultA).not.toBeNull();
  expect(resultB).not.toBeNull();
  expect(resultA!.id).toBe(resultB!.id);

  const payments = await prisma.payment.findMany({ where: { userPlanId: userPlan.id } });
  expect(payments).toHaveLength(1);
  expect(payments[0].idempotencyKey).toBe(idempotencyKey);

  await prisma.ledgerEntry.deleteMany({ where: { userId: userPlan.userId } });
  await prisma.paymentEvent.deleteMany({ where: { paymentId: resultA!.id } });
  await prisma.payment.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.paymentMandate.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.userPlan.deleteMany({ where: { id: userPlan.id } });
});

test("BRD Rule XXXVI.5: an invalid webhook signature is rejected before any payment, ledger entry, or commission is created", async () => {
  const { userPlan } = await createDuePaymentMandate();
  const idempotencyKey = `pw-idem-badsig-${uniqueSuffix()}`;

  const result = await processScheduledPayment({
    userPlanId: userPlan.id,
    idempotencyKey,
    forceOutcome: "SUCCESS",
    forceInvalidSignature: true,
  });
  expect(result).toBeNull();

  const payments = await prisma.payment.findMany({ where: { userPlanId: userPlan.id } });
  expect(payments).toHaveLength(0);

  const ledgerEntries = await prisma.ledgerEntry.findMany({ where: { userId: userPlan.userId } });
  expect(ledgerEntries).toHaveLength(0);

  const unchangedPlan = await prisma.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
  expect(Number(unchangedPlan.principalPaid)).toBe(0);

  const audit = await prisma.auditLog.findFirst({
    where: { eventType: "WEBHOOK_SIGNATURE_INVALID", entityRef: userPlan.id },
    orderBy: { timestamp: "desc" },
  });
  expect(audit).not.toBeNull();

  // A subsequent retry with the SAME idempotencyKey but a valid signature
  // must be free to succeed — the rejected attempt must not have poisoned the
  // key by partially persisting anything under it.
  const retried = await processScheduledPayment({ userPlanId: userPlan.id, idempotencyKey, forceOutcome: "SUCCESS" });
  expect(retried).not.toBeNull();
  expect(retried!.status).toBe("SUCCESS");

  await prisma.ledgerEntry.deleteMany({ where: { userId: userPlan.userId } });
  await prisma.paymentEvent.deleteMany({ where: { paymentId: retried!.id } });
  await prisma.payment.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.paymentMandate.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.userPlan.deleteMany({ where: { id: userPlan.id } });
});
