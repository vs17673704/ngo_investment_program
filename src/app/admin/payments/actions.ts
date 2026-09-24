"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { runDueAutoPayCharges } from "@/lib/autopay-scheduler";
import { runDuePaymentRetries } from "@/lib/payment-engine";
import { runMaturityTransitions } from "@/lib/interest-engine";
import { runInstalmentReminders } from "@/lib/instalment-reminder";
import { logAudit } from "@/lib/audit";
import { emitAdminEvent } from "@/lib/events/admin-events";
import type { SimulatedOutcome } from "@/lib/providers/razorpay";

function parseForceOutcome(formData: FormData): SimulatedOutcome | undefined {
  const raw = formData.get("forceOutcome");
  if (raw === "SUCCESS" || raw === "FAILED" || raw === "PENDING") return raw;
  return undefined;
}

function parseForceInvalidSignature(formData: FormData): boolean {
  return formData.get("forceInvalidSignature") === "on";
}

export async function runDueAutoPayChargesAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const results = await runDueAutoPayCharges(parseForceOutcome(formData), parseForceInvalidSignature(formData));

  await logAudit({
    actorUserId: session.sub,
    eventType: "AUTOPAY_BATCH_RUN",
    entityRef: `count:${results.length}`,
  });
  emitAdminEvent({
    type: "autopay.batch_run",
    message: `AutoPay batch run completed (${results.length} charge${results.length === 1 ? "" : "s"} processed)`,
    details: { count: results.length },
  });

  revalidatePath("/admin/payments");
}

// BRD Rule XXVII: stands in for the recurring automatic retry job — an admin
// explicitly triggers it from the simulator screen (Master Prompt: no real
// cron/queue infra in this prototype).
export async function runDuePaymentRetriesAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const results = await runDuePaymentRetries(parseForceOutcome(formData), parseForceInvalidSignature(formData));

  await logAudit({
    actorUserId: session.sub,
    eventType: "PAYMENT_RETRY_BATCH_RUN",
    entityRef: `count:${results.length}`,
  });
  emitAdminEvent({
    type: "payment_retry.batch_run",
    message: `Payment retry batch run completed (${results.length} retr${results.length === 1 ? "y" : "ies"} processed)`,
    details: { count: results.length },
  });

  revalidatePath("/admin/payments");
}

export async function simulateMandateExpiryAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const mandateId = String(formData.get("mandateId") ?? "");
  if (!mandateId) throw new Error("Missing mandateId");

  await prisma.paymentMandate.update({ where: { id: mandateId }, data: { status: "EXPIRED" } });
  await logAudit({ actorUserId: session.sub, eventType: "MANDATE_SIMULATED_EXPIRY", entityRef: mandateId });

  revalidatePath("/admin/payments");
}

export async function simulateMandateCancellationAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const mandateId = String(formData.get("mandateId") ?? "");
  if (!mandateId) throw new Error("Missing mandateId");

  await prisma.paymentMandate.update({ where: { id: mandateId }, data: { status: "CANCELLED" } });
  await logAudit({ actorUserId: session.sub, eventType: "MANDATE_SIMULATED_CANCELLATION", entityRef: mandateId });

  revalidatePath("/admin/payments");
}

// Prototype "no real cron" convention (Master Prompt): an admin explicitly
// triggers the plan-maturity batch, which stands in for a scheduled job that
// would otherwise run daily to transition matured plans and post their
// one-time interest (BRD Interest Engine: "Interest on Plan: applicable only
// at plan maturity").
export async function runMaturityTransitionsAction(): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const results = await runMaturityTransitions();

  await logAudit({
    actorUserId: session.sub,
    eventType: "MATURITY_BATCH_RUN",
    entityRef: `count:${results.length}`,
  });
  emitAdminEvent({
    type: "maturity.batch_run",
    message: `Maturity batch run completed (${results.length} plan${results.length === 1 ? "" : "s"} transitioned)`,
    details: { count: results.length },
  });

  revalidatePath("/admin/payments");
  revalidatePath("/admin/redemptions");
}

// BRD Rule XXXVIII: stands in for the recurring reminder job — an admin
// explicitly triggers it from the simulator screen (same "no real cron/queue
// infra" prototype convention as AutoPay/Retry/Maturity above).
export async function runInstalmentRemindersAction(): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const results = await runInstalmentReminders();

  await logAudit({
    actorUserId: session.sub,
    eventType: "INSTALMENT_REMINDER_BATCH_RUN",
    entityRef: `count:${results.length}`,
  });
  emitAdminEvent({
    type: "instalment_reminder.batch_run",
    message: `Instalment reminder batch run completed (${results.length} reminder${results.length === 1 ? "" : "s"} sent)`,
    details: { count: results.length },
  });

  revalidatePath("/admin/payments");
}
