"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { submitManualPayment } from "@/lib/payment-engine";
import { logAudit } from "@/lib/audit";
import { emitAdminEvent } from "@/lib/events/admin-events";
import { prisma } from "@/lib/prisma";
import type { PaymentMethod } from "@prisma/client";

const VALID_METHODS: PaymentMethod[] = ["CARD", "UPI", "NETBANKING", "WALLET"];

export type ManualPaymentState = { error?: string } | undefined;

// BRD Rule XXVII Manual Payment Fallback: user-initiated completion of a
// FAILED instalment, only accepted while still within manualWindowEndsAt.
export async function submitManualPaymentAction(
  paymentId: string,
  _prev: ManualPaymentState,
  _formData: FormData,
): Promise<ManualPaymentState> {
  const session = await getSession();
  if (!session) return { error: "You must be logged in." };

  try {
    await submitManualPayment(paymentId, session.sub);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Payment could not be processed." };
  }

  await logAudit({
    actorUserId: session.sub,
    eventType: "MANUAL_PAYMENT_SUBMITTED",
    entityRef: paymentId,
  });
  emitAdminEvent({
    type: "manual_payment.submitted",
    message: "A manual payment was submitted by the user",
    details: { paymentId },
  });

  revalidatePath("/dashboard/payments");
  return undefined;
}

export type ChangePaymentMethodState = { error?: string; success?: boolean } | undefined;

// Design.md 5.13: "Change payment method where permitted" — permitted only
// for the owning user's own ACTIVE/DISCONTINUED plan, and never alters plan
// amount, frequency, already-paid principal, or accrued interest; it only
// changes which simulated method future (not-yet-processed) payments use.
export async function changePaymentMethodAction(
  userPlanId: string,
  _prev: ChangePaymentMethodState,
  formData: FormData,
): Promise<ChangePaymentMethodState> {
  const session = await getSession();
  if (!session) return { error: "You must be logged in." };

  const method = formData.get("method");
  if (typeof method !== "string" || !VALID_METHODS.includes(method as PaymentMethod)) {
    return { error: "Please choose a valid payment method." };
  }

  const userPlan = await prisma.userPlan.findUnique({ where: { id: userPlanId } });
  if (!userPlan || userPlan.userId !== session.sub) {
    return { error: "Plan not found." };
  }
  if (userPlan.status !== "ACTIVE" && userPlan.status !== "DISCONTINUED") {
    return { error: "Payment method can only be changed for an active or discontinued plan." };
  }

  await prisma.userPlan.update({
    where: { id: userPlanId },
    data: { preferredPaymentMethod: method as PaymentMethod },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "PAYMENT_METHOD_CHANGED",
    entityRef: userPlanId,
    details: { method },
  });

  revalidatePath("/dashboard/payments");
  return { success: true };
}
