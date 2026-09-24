// Simulated Razorpay AutoPay provider (Master Prompt: no real payment gateway).
// All IDs are fake, sequential, and clearly prefixed so they can never be
// mistaken for real Razorpay identifiers (Master Prompt: "clearly fake").

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

// `count() + 1` is read-then-write and not atomic: two overlapping calls can
// read the same count before either row commits, producing duplicate IDs and
// tripping the DB's unique constraint on the second insert. A random suffix
// keeps the ID "sequential-looking" (per the file-level comment) while making
// collisions negligible without needing an atomic DB counter.
async function nextSequentialId(entity: string, count: () => Promise<number>): Promise<string> {
  const n = (await count()) + 1;
  const suffix = randomBytes(3).toString("hex");
  return `SIM-${entity}-${String(n).padStart(6, "0")}-${suffix}`;
}

export async function simulateCreateMandate() {
  const gatewayMandateId = await nextSequentialId("MANDATE", () => prisma.paymentMandate.count());
  return { gatewayMandateId };
}

export async function simulateCreateOrder() {
  const gatewayOrderId = await nextSequentialId("ORDER", () => prisma.payment.count());
  return { gatewayOrderId };
}

// BRD Rule XXXVI.5: webhook signature verification using a simulated secret,
// mirroring exactly what real Razorpay HMAC verification does. The secret is
// never exposed in logs, API responses, or the UI.
function getWebhookSecret(): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not set. Add it to .env.");
  }
  return secret;
}

export function signWebhookPayload(rawPayload: string): string {
  return createHmac("sha256", getWebhookSecret()).update(rawPayload).digest("hex");
}

export function verifyWebhookSignature(rawPayload: string, signature: string): boolean {
  const expected = signWebhookPayload(rawPayload);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export type SimulatedOutcome = "SUCCESS" | "FAILED" | "PENDING" | "CANCELLED" | "EXPIRED";

// Deterministic-ish outcome for the prototype: succeeds unless the caller
// forces a specific outcome (used by the admin payment simulator / retries).
// `forceInvalidSignature` is a test hook to demonstrate the BRD Rule XXXVI.5
// rejection path (mirrors a tampered/incorrect real Razorpay webhook).
export async function simulateChargePayment(
  forceOutcome?: SimulatedOutcome,
  forceInvalidSignature?: boolean,
) {
  const outcome: SimulatedOutcome = forceOutcome ?? "SUCCESS";
  const gatewayPaymentId =
    outcome === "SUCCESS" ? await nextSequentialId("PAY", () => prisma.payment.count()) : null;
  const gatewayEventId = await nextSequentialId("EVT", () => prisma.paymentEvent.count());

  const rawPayload = JSON.stringify({ outcome, gatewayPaymentId, gatewayEventId, simulated: true });
  let signature = signWebhookPayload(rawPayload);
  if (forceInvalidSignature) {
    signature = signature.slice(0, -1) + (signature.at(-1) === "0" ? "1" : "0");
  }

  return { outcome, gatewayPaymentId, gatewayEventId, rawPayload, signature };
}
