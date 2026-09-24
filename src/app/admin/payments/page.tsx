import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { findDuePlans } from "@/lib/autopay-scheduler";
import { findDuePaymentRetries } from "@/lib/payment-engine";
import { findDueInstalmentReminders } from "@/lib/instalment-reminder";
import {
  runDueAutoPayChargesAction,
  runDuePaymentRetriesAction,
  runMaturityTransitionsAction,
  runInstalmentRemindersAction,
  simulateMandateExpiryAction,
  simulateMandateCancellationAction,
} from "./actions";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "bg-secondary-container/30 text-secondary",
  RETRYING: "bg-tertiary-container text-on-tertiary-container",
  FAILED: "bg-error-container text-error",
  PENDING: "bg-surface-container text-on-surface-variant",
  INITIATED: "bg-surface-container text-on-surface-variant",
};

const inputClass =
  "min-h-touch rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";

function ForceOutcomeSelect() {
  return (
    <select name="forceOutcome" defaultValue="SUCCESS" className={inputClass}>
      <option value="SUCCESS">Simulate: SUCCESS</option>
      <option value="FAILED">Simulate: FAILED</option>
    </select>
  );
}

function InvalidSignatureCheckbox() {
  return (
    <label className="flex min-h-touch items-center gap-2 text-sm text-on-surface">
      <input type="checkbox" name="forceInvalidSignature" className="h-4 w-4 accent-primary" />
      Simulate invalid webhook signature
    </label>
  );
}

export default async function AdminPaymentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [duePlans, dueRetries, dueReminders, recentPayments, dueMaturityCount, activeMandates] = await Promise.all([
    findDuePlans(),
    findDuePaymentRetries(),
    findDueInstalmentReminders(),
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { userPlan: { include: { user: true, plan: true } } },
    }),
    prisma.userPlan.count({
      where: { status: { in: ["ACTIVE", "DISCONTINUED"] }, maturityDate: { lte: new Date() } },
    }),
    prisma.paymentMandate.findMany({
      where: { status: "ACTIVE" },
      include: { userPlan: { include: { user: true, plan: true } } },
    }),
  ]);

  return (
    <>
      <AdminPageHeader title="Razorpay AutoPay Simulator" />
      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <p className="text-sm text-on-surface">
          {duePlans.length} subscription{duePlans.length === 1 ? "" : "s"} due for an AutoPay charge right now.
        </p>
        <form action={runDueAutoPayChargesAction} className="mt-3 flex flex-wrap items-center gap-2">
          <ForceOutcomeSelect />
          <InvalidSignatureCheckbox />
          <button
            type="submit"
            disabled={duePlans.length === 0}
            className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
          >
            Run due AutoPay charges now
          </button>
        </form>
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <p className="text-sm text-on-surface">
          {dueRetries.length} payment{dueRetries.length === 1 ? "" : "s"} due for an automatic retry.
        </p>
        <form action={runDuePaymentRetriesAction} className="mt-3 flex flex-wrap items-center gap-2">
          <ForceOutcomeSelect />
          <InvalidSignatureCheckbox />
          <button
            type="submit"
            disabled={dueRetries.length === 0}
            className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
          >
            Run due payment retries now
          </button>
        </form>
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <p className="text-sm text-on-surface">
          {dueReminders.length} instalment{dueReminders.length === 1 ? "" : "s"} due for an upcoming-reminder
          notification.
        </p>
        <form action={runInstalmentRemindersAction} className="mt-3">
          <button
            type="submit"
            disabled={dueReminders.length === 0}
            className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
          >
            Run instalment reminders now
          </button>
        </form>
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <p className="mb-2 text-sm font-medium text-primary">Active mandates (simulate expiry/cancellation)</p>
        {activeMandates.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No active mandates.</p>
        ) : (
          <ul className="flex max-h-[28rem] flex-col divide-y divide-surface-container overflow-auto">
            {activeMandates.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-on-surface">
                  {m.userPlan.user.email} · {m.userPlan.plan.name} · {m.gatewayMandateId}
                </span>
                <span className="flex gap-2">
                  <form action={simulateMandateExpiryAction}>
                    <input type="hidden" name="mandateId" value={m.id} />
                    <button
                      type="submit"
                      className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-3 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                    >
                      Simulate expiry
                    </button>
                  </form>
                  <form action={simulateMandateCancellationAction}>
                    <input type="hidden" name="mandateId" value={m.id} />
                    <button
                      type="submit"
                      className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-3 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                    >
                      Simulate cancellation
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <p className="text-sm text-on-surface">
          {dueMaturityCount} plan{dueMaturityCount === 1 ? "" : "s"} due for maturity transition (one-time interest
          calculation + unlock for redemption).
        </p>
        <form action={runMaturityTransitionsAction} className="mt-3">
          <button
            type="submit"
            disabled={dueMaturityCount === 0}
            className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
          >
            Run plan maturity check now
          </button>
        </form>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-primary">Recent simulated payments</h2>
        {recentPayments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
            <Icon name="receipt_long" className="text-[32px] text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">No payments processed yet.</p>
          </div>
        ) : (
          <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
            {recentPayments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
                <div>
                  <p className="font-medium text-primary">
                    {p.userPlan.user.email} · {p.userPlan.plan.name}
                  </p>
                  <p className="text-sm text-on-surface-variant">
                    ₹{Number(p.amount).toFixed(2)} · {p.gatewayOrderId}
                    {p.retryCount > 0 ? ` · ${p.retryCount} retry attempt(s)` : ""}
                  </p>
                  {p.status === "RETRYING" && p.nextRetryAt && (
                    <p className="text-xs text-on-surface-variant">
                      Next retry at {p.nextRetryAt.toLocaleString()}
                      {p.gracePeriodEndsAt ? ` · grace period ends ${p.gracePeriodEndsAt.toLocaleString()}` : ""}
                    </p>
                  )}
                  {p.status === "FAILED" && p.manualWindowEndsAt && (
                    <p className="text-xs text-on-surface-variant">
                      Manual payment window ends {p.manualWindowEndsAt.toLocaleString()}
                    </p>
                  )}
                </div>
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[p.status] ?? "bg-surface-container text-on-surface-variant"}`}>
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
