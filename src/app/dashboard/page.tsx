import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getUserDashboardData } from "@/lib/dashboard";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";
import { Card } from "@/components/ui/Card";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "text-secondary bg-secondary-container/30",
  MATURED: "text-on-tertiary-container bg-tertiary-fixed/60",
  PARTIALLY_REDEEMED: "text-amber-800 bg-surface-container",
  REDEEMED: "text-on-secondary-container bg-secondary-container",
  DISCONTINUED: "text-error bg-error-container",
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await getUserDashboardData(session.sub);

  const stats: Array<{ label: string; value: string; sub: string; icon: string }> = [
    {
      label: "Total Invested",
      value: formatINR(data.totalInvested),
      sub: "Cumulative principal across plans",
      icon: "account_balance_wallet",
    },
    {
      label: "Redeemable Balance",
      value: formatINR(data.redeemableBalance),
      sub: "Available to request redemption",
      icon: "account_balance",
    },
    {
      label: "Total Interest",
      value: formatINR(data.totalInterest),
      sub: "Credited at plan maturity",
      icon: "trending_up",
    },
    {
      label: "Reward Points",
      value: `${data.rewardPoints} PTS`,
      sub: "Tuition credit units (no currency)",
      icon: "stars",
    },
    {
      label: "Active Plans",
      value: `${data.activePlanCount}`,
      sub: "Ongoing SIPs",
      icon: "donut_large",
    },
    {
      label: "Closed Plans",
      value: `${data.closedPlanCount}`,
      sub: "Matured, redeemed or discontinued",
      icon: "task_alt",
    },
    {
      label: "Referral Earnings",
      value: formatINR(data.referralEarnings),
      sub: "Credited from your referral network",
      icon: "share",
    },
  ];

  return (
    <>
      {!data.user.isEmailVerified ? (
        <div className="flex items-center gap-3 rounded-xl border border-tertiary-fixed-dim bg-tertiary-fixed/40 p-4 text-sm text-on-tertiary-container">
          <Icon name="mark_email_unread" className="text-[20px]" />
          <span className="flex-1">Your email address is not verified yet.</span>
          <Link href="/dashboard/verify-email" className="font-semibold whitespace-nowrap hover:underline">
            Verify now
          </Link>
        </div>
      ) : null}

      <section aria-label="Financial Summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="flex flex-col justify-between transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                {stat.label}
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
                <Icon name={stat.icon} className="text-[16px]" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-2xl font-bold tracking-tight text-primary">{stat.value}</span>
              <p className="mt-1 text-xs text-on-surface-variant">{stat.sub}</p>
            </div>
          </Card>
        ))}
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <section className="flex flex-col gap-4 lg:col-span-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-xl font-bold tracking-tight text-primary">Your Subscribed Plans</h2>
              <p className="text-sm text-on-surface-variant">
                Real-time ledger tracking, instalment lifecycles, and maturity milestones.
              </p>
            </div>
            <Link href="/plans" className="hidden items-center gap-1 text-sm font-semibold text-primary hover:underline sm:inline-flex">
              Explore All Tiers
              <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
          </div>

          {data.userPlans.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
              <Icon name="inbox" className="text-[32px] text-on-surface-variant" />
              <p className="font-semibold text-on-surface">You haven&apos;t subscribed to any plans yet</p>
              <Link href="/plans" className="text-sm font-semibold text-primary hover:underline">
                Browse Investment Plans
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {data.userPlans.map((up) => {
                const principalPaid = Number(up.principalPaid);
                const paymentAmount = Number(up.paymentAmount);
                const installmentsPaid = paymentAmount > 0 ? Math.round(principalPaid / paymentAmount) : 0;
                return (
                  <Card
                    as="article"
                    key={up.id}
                    className="flex flex-col gap-3 transition-shadow hover:shadow-md md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-primary">{up.plan.name}</h3>
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[up.status] ?? "bg-surface-container text-on-surface-variant"}`}
                        >
                          {up.status.replace(/_/g, " ")}
                        </span>
                        <span className="rounded bg-surface-container px-2 py-0.5 text-[11px] text-on-surface-variant">
                          {up.paymentFrequency}
                        </span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-on-surface-variant sm:grid-cols-3">
                        <div>
                          <span className="block text-xs text-outline">Instalment</span>
                          <span className="text-sm font-semibold text-primary">
                            {formatINR(up.paymentAmount)} / {up.paymentFrequency === "LUMPSUM" ? "one-time" : "period"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs text-outline">Maturity Date</span>
                          <span className="text-sm text-on-surface">
                            {new Date(up.maturityDate).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs text-outline">Principal Paid</span>
                          <span className="text-sm font-semibold text-primary">{formatINR(up.principalPaid)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:self-center">
                      {up.status === "MATURED" ? (
                        <Link
                          href="/dashboard/redeem"
                          className="flex min-h-touch items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold whitespace-nowrap text-on-primary shadow-md transition-all hover:bg-primary-container"
                        >
                          <Icon name="currency_exchange" className="text-[18px]" />
                          Redeem or Reinvest
                        </Link>
                      ) : up.status === "PARTIALLY_REDEEMED" ? (
                        <Link
                          href="/dashboard/redeem"
                          className="flex min-h-touch items-center justify-center rounded-xl bg-surface-container px-4 text-sm font-medium text-primary transition-colors hover:bg-surface-container-high"
                        >
                          Redeem Remaining Balance
                        </Link>
                      ) : up.status === "REDEEMED" ? (
                        <Link
                          href="/dashboard/payments"
                          className="flex min-h-touch items-center justify-center rounded-xl bg-surface-container px-4 text-sm font-medium text-primary transition-colors hover:bg-surface-container-high"
                        >
                          View Redemption History
                        </Link>
                      ) : (
                        <span className="flex min-h-touch items-center justify-center rounded-xl bg-surface-container px-4 text-sm font-medium text-on-surface-variant" title={`${installmentsPaid} instalments paid`}>
                          {installmentsPaid} paid
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {data.rewardPoints > 0 ? (
            <div className="mt-1 flex items-start gap-4 rounded-xl bg-surface-container p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
                <Icon name="school" className="text-[22px]" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-primary">Convert {data.rewardPoints} Reward Points</h4>
                <p className="mt-0.5 text-sm text-on-surface-variant">
                  Your points can offset course tuition fees across accredited learning partners.
                </p>
                <Link href="/dashboard/redeem/course" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  View Learning Catalog
                  <Icon name="north_east" className="text-[16px]" />
                </Link>
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold tracking-tight text-primary">Compliance</h2>
          </div>
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                Unified Financial Ledger
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-secondary-container/30 px-1.5 py-0.5 text-[10px] font-semibold text-secondary">
                RECONCILED
              </span>
            </div>
            <div className="flex items-center gap-2 rounded bg-surface-container p-2 text-sm text-on-surface">
              <Icon name="verified" className="text-[18px] text-secondary" />
              <span className="font-medium">Every transaction is recorded against a single running ledger</span>
            </div>
          </Card>
        </section>
      </div>
    </>
  );
}
