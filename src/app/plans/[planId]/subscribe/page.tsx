import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getUserDashboardData } from "@/lib/dashboard";
import { DashboardShell } from "@/components/DashboardShell";
import { Icon } from "@/components/Icon";
import { SubscribeForm } from "./SubscribeForm";
import type { Cadence } from "@/lib/range-generator";

export default async function SubscribePage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect(`/login`);

  const { planId } = await params;
  const [data, plan] = await Promise.all([
    getUserDashboardData(session.sub),
    prisma.plan.findUnique({ where: { id: planId }, include: { interestMethod: true } }),
  ]);
  if (!plan || plan.status !== "ACTIVE") notFound();

  const amounts = plan.presetAmounts.map((a) => Number(a));
  // BRD Rule XLIX: durations only apply to recurring (MONTHLY) plans — a
  // LUMPSUM plan is a single one-time payment with no cadence choice
  // (Drafted Clarification — pending client confirmation, BRD Rule XLVIII(d)).
  const cadences: Cadence[] =
    plan.paymentFrequency === "MONTHLY" ? (plan.paymentCadences as unknown as Cadence[]) : [];

  return (
    <DashboardShell email={data.user.email} referralCode={data.user.referralCode} unreadNotificationCount={data.unreadNotificationCount}>
      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="flex flex-col gap-4 lg:col-span-5">
          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-md">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Fixed Tenure Contract
                </span>
                <h2 className="font-heading mt-0.5 text-2xl font-bold tracking-tight text-primary">{plan.name}</h2>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface-container-low p-4">
                <span className="block text-[11px] uppercase tracking-wide text-on-surface-variant">
                  {plan.interestMethod.formulaType === "SIMPLE" ? "Base Yield (S.I.)" : "Base Yield"}
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-primary">{Number(plan.interestMethod.ratePercent)}%</span>
                  <span className="text-sm text-on-surface-variant">p.a.</span>
                </div>
              </div>
              <div className="rounded-lg bg-surface-container-low p-4">
                <span className="block text-[11px] uppercase tracking-wide text-on-surface-variant">Reward Points</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-primary">{plan.rewardPercent ? Number(plan.rewardPercent) : 0}%</span>
                  <span className="text-sm text-on-surface-variant">of course fee</span>
                </div>
                <span className="mt-0.5 flex items-center gap-0.5 text-[11px] font-medium text-on-surface-variant">
                  <Icon name="school" className="text-[13px]" /> Granted at course redemption
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 rounded-lg bg-surface-container p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">Contract Tenure</span>
                <span className="font-semibold text-on-surface">{plan.tenureMonths} Months (Fixed)</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">Instalment Cadence</span>
                <span className="font-semibold text-on-surface">
                  {plan.paymentFrequency === "MONTHLY" ? "Monthly Recurring" : "One-time Lumpsum"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">Interest Method</span>
                <span className="font-semibold text-on-surface">{plan.interestMethod.name}</span>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-lg bg-surface p-3">
              <Icon name="verified" className="mt-0.5 shrink-0 text-[20px] text-secondary" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-on-surface">Simulated Settlement Guarantee</span>
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  Funds are routed via a scheduled nodal account under simulated compliance protocols. No real payment
                  gateway is involved in this sandbox.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex flex-col gap-4 lg:col-span-7">
          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-md sm:p-8">
            <div className="mb-6">
              <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Mandate Specification</span>
              <h1 className="font-heading mt-0.5 text-3xl font-bold tracking-tight text-primary">
                Subscribe to {plan.name}
              </h1>
              <p className="mt-2 leading-relaxed text-on-surface-variant">
                Configure your recurring {plan.paymentFrequency === "MONTHLY" ? "monthly" : "one-time"} AutoPay via a
                simulated Razorpay mandate for {plan.tenureMonths} months. No real charge will occur.
              </p>
            </div>

            <SubscribeForm planId={plan.id} amounts={amounts} cadences={cadences} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 text-xs text-on-surface-variant shadow-sm">
            <span className="flex items-center gap-1.5">
              <Icon name="enhanced_encryption" className="text-[18px] text-primary" />
              Simulated secure channel
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="schedule" className="text-[18px] text-secondary" />
              Zero processing fees
            </span>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
