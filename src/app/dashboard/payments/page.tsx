import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getUserDashboardData, computeNextDeduction } from "@/lib/dashboard";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";
import ManualPaymentButton from "./ManualPaymentButton";
import ChangePaymentMethodForm from "./ChangePaymentMethodForm";
import { Card } from "@/components/ui/Card";
import { TransactionGraph } from "./TransactionGraph";

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "text-secondary bg-secondary-container/30",
  RETRYING: "text-amber-800 bg-surface-container",
  FAILED: "text-error bg-error-container",
  PENDING: "text-on-surface-variant bg-surface-container",
  INITIATED: "text-on-surface-variant bg-surface-container",
};

export default async function PaymentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [data, payments, mandates, approvedRedemptions] = await Promise.all([
    getUserDashboardData(session.sub),
    prisma.payment.findMany({
      where: { userPlan: { userId: session.sub } },
      orderBy: { createdAt: "desc" },
      include: { userPlan: { include: { plan: true } } },
    }),
    prisma.paymentMandate.findMany({
      where: { userPlan: { userId: session.sub } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.redemptionRequest.findMany({
      where: { userId: session.sub, status: "APPROVED" },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const now = new Date();
  const latestMandateByPlan = new Map<string, (typeof mandates)[number]>();
  for (const mandate of mandates) {
    if (!latestMandateByPlan.has(mandate.userPlanId)) latestMandateByPlan.set(mandate.userPlanId, mandate);
  }

  // Design.md §3.4 "Transaction Graph": successful payment totals, groupable
  // by day/week/month via a dropdown — a plain data summary, not a chart
  // library. Grouping/bucketing happens client-side in TransactionGraph, so
  // only pre-serialize the raw successful-payment amounts/dates here.
  const graphPayments = payments
    .filter((p) => p.status === "SUCCESS" && p.actualDate)
    .map((p) => ({ amount: Number(p.amount), dateIso: p.actualDate!.toISOString() }));

  return (
    <>
      <div className="flex w-full flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Payment History</h1>

        <section aria-label="AutoPay & Next Deduction" className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-bold tracking-tight text-primary">AutoPay &amp; Next Deduction</h2>
          {data.userPlans.filter((up) => up.status === "ACTIVE" || up.status === "DISCONTINUED").length === 0 ? (
            <p className="text-sm text-on-surface-variant">No active AutoPay-eligible plans.</p>
          ) : (
            data.userPlans
              .filter((up) => up.status === "ACTIVE" || up.status === "DISCONTINUED")
              .map((up) => {
                const nextDeduction = computeNextDeduction(up);
                const mandate = latestMandateByPlan.get(up.id);
                return (
                  <Card key={up.id} data-user-plan-id={up.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-primary">{up.plan.name}</p>
                      <span className="rounded bg-surface-container px-2 py-0.5 text-[11px] text-on-surface-variant">
                        Mandate: {mandate?.status ?? "NONE"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-on-surface-variant sm:grid-cols-3">
                      <div>
                        <span className="block text-xs text-outline">Next Deduction</span>
                        <span className="text-sm font-semibold text-primary">
                          {nextDeduction
                            ? `${formatINR(nextDeduction.amount)} on ${nextDeduction.date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}`
                            : "None scheduled"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs text-outline">Current Method</span>
                        <span className="text-sm text-on-surface">{up.preferredPaymentMethod}</span>
                      </div>
                    </div>
                    <ChangePaymentMethodForm userPlanId={up.id} currentMethod={up.preferredPaymentMethod} />
                  </Card>
                );
              })
          )}
        </section>

        {graphPayments.length > 0 && <TransactionGraph payments={graphPayments} />}

        <section aria-label="Payout Information" className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-bold tracking-tight text-primary">Payout Information</h2>
          {approvedRedemptions.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No payouts yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {approvedRedemptions.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-3 shadow-sm">
                  <div>
                    <p className="font-medium text-primary">{r.category.replace(/_/g, " ")}</p>
                    <p className="text-xs text-on-surface-variant">{r.updatedAt.toLocaleDateString("en-IN")}</p>
                  </div>
                  <span className="font-semibold text-secondary">{formatINR(r.requestedAmount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {payments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
            <Icon name="receipt_long" className="text-[32px] text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">No payments yet.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {payments.map((p) => {
              const canPayManually =
                p.status === "FAILED" && p.manualWindowEndsAt !== null && now <= p.manualWindowEndsAt;
              return (
                <Card as="li" key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-primary">{p.userPlan.plan.name}</p>
                    <p className="text-sm text-on-surface-variant">
                      {formatINR(p.amount)} · {p.scheduledDate.toLocaleDateString()}
                    </p>
                    {p.status === "RETRYING" && p.nextRetryAt && (
                      <p className="mt-0.5 text-xs text-outline">
                        We&apos;ll automatically retry at {p.nextRetryAt.toLocaleString()}
                      </p>
                    )}
                    {p.status === "FAILED" && p.manualWindowEndsAt && (
                      <p className="mt-0.5 text-xs text-outline">
                        {canPayManually
                          ? `Pay manually before ${p.manualWindowEndsAt.toLocaleString()}`
                          : "Manual payment window has closed"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_STYLES[p.status] ?? "bg-surface-container text-on-surface-variant"}`}>
                      {p.status}
                    </span>
                    {canPayManually && <ManualPaymentButton paymentId={p.id} />}
                  </div>
                </Card>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
