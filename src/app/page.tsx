import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SiteNav } from "@/components/SiteNav";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";
import { getSession } from "@/lib/auth/session";

export default async function LandingPage() {
  // Mirrors login/page.tsx: a signed-in visitor (including one arriving via
  // a bfcache-restored Back navigation — see BfcacheGuard.tsx) should land
  // on their dashboard, not this signed-out marketing page.
  const session = await getSession();
  if (session) {
    redirect(session.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  const [plans, franchiseePlans] = await Promise.all([
    prisma.plan.findMany({
      where: { status: "ACTIVE" },
      take: 6,
      include: { interestMethod: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.franchiseePlan.findMany({
      take: 6,
      include: { collegeMappings: { include: { college: true } } },
    }),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-surface">
      <SiteNav />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-8 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-surface-container-low p-8 sm:p-12">
            <div className="relative z-10 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
              <div className="flex flex-col gap-4 lg:col-span-7">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface">
                  <span className="h-2 w-2 rounded-full bg-secondary" />
                  Compliant Referral &amp; Wealth Accrual Platform
                </span>
                <h1 className="font-heading text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">
                  Invest, refer, and earn rewards
                </h1>
                <p className="max-w-xl text-base text-on-surface-variant">
                  Browse available plans and franchisee options below — no account required.
                  Register to start investing and earning referral rewards.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href="#plans"
                    className="inline-flex min-h-touch items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container"
                  >
                    <Icon name="trending_up" className="text-[18px]" />
                    Explore Investment Plans
                  </a>
                  <a
                    href="#franchisee"
                    className="inline-flex min-h-touch items-center justify-center gap-2 rounded-xl bg-surface-container-lowest px-5 text-sm font-medium text-on-surface shadow-sm transition-all hover:bg-surface-container"
                  >
                    <Icon name="domain" className="text-[18px]" />
                    View Franchisee Network
                  </a>
                </div>
              </div>
              <div className="lg:col-span-5">
                <div className="flex items-center justify-between rounded-2xl bg-surface-container-lowest p-4 shadow-md">
                  <div className="flex flex-col">
                    <span className="text-xs text-on-surface-variant">Available Plans</span>
                    <span className="text-2xl font-bold text-on-surface">{plans.length}</span>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-container/50 text-secondary">
                    <Icon name="account_balance_wallet" className="text-[24px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section id="plans" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-secondary">
                <Icon name="bar_chart" className="text-[16px]" />
                Asset Growth Engine
              </div>
              <h2 className="font-heading text-2xl font-semibold text-on-surface">
                Featured Investment Plans
              </h2>
              <p className="text-sm text-on-surface-variant">
                Configured tenure with guaranteed maturity calculation and flexible AutoPay
              </p>
            </div>
            <Link
              href="/plans"
              className="inline-flex items-center gap-1 text-sm font-medium text-on-surface transition-colors hover:text-primary"
            >
              View Full Catalog
              <Icon name="arrow_forward" className="text-[18px]" />
            </Link>
          </div>

          {plans.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="No Investment Plans Yet"
              body="The Admin has not configured any active Plans yet. Please check back soon."
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl bg-surface-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="mb-1 inline-block rounded bg-surface-container px-2 py-0.5 text-[11px] font-semibold uppercase text-on-surface">
                          {plan.tenureMonths} Months Tenure
                        </span>
                        <h3 className="font-heading text-lg font-semibold text-on-surface">
                          {plan.name}
                        </h3>
                      </div>
                      <span className="flex items-center gap-1 rounded bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                        {plan.paymentFrequency === "LUMPSUM" ? "Lumpsum One-Time" : "Monthly AutoPay"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-on-surface-variant">Annual Yield</span>
                        <span className="text-sm font-bold text-secondary">
                          {Number(plan.interestMethod.ratePercent).toFixed(2)}% p.a. (
                          {plan.interestMethod.formulaType === "SIMPLE" ? "Simple" : "Compound"})
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-on-surface-variant">Referral Commission</span>
                        <span className="text-sm font-medium text-on-surface">
                          {Number(plan.commissionPercent).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    {plan.presetAmounts.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs text-on-surface-variant">
                          {plan.paymentFrequency === "LUMPSUM"
                            ? "Preset One-Time Deposit"
                            : "Preset AutoPay Deposit"}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {plan.presetAmounts.map((amount, idx) => (
                            <span
                              key={idx}
                              className="inline-flex min-h-touch items-center justify-center rounded-lg bg-surface-container px-3 text-xs font-medium text-on-surface-variant"
                            >
                              {formatINR(amount)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <Link
                    href="/login"
                    className="flex min-h-touch w-full items-center justify-center gap-1 rounded-xl bg-primary text-sm font-medium text-on-primary transition-all hover:bg-primary-container"
                  >
                    View &amp; Subscribe
                    <Icon name="chevron_right" className="text-[18px]" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Franchisee */}
        <section id="franchisee" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-secondary">
                <Icon name="corporate_fare" className="text-[16px]" />
                Institutional Alliances
              </div>
              <h2 className="font-heading text-2xl font-semibold text-on-surface">
                Franchisee Partnership Programs
              </h2>
              <p className="text-sm text-on-surface-variant">
                Select an institutional franchise plan and connect directly with accredited partner
                colleges
              </p>
            </div>
            <Link
              href="/franchisee"
              className="inline-flex items-center gap-1 text-sm font-medium text-on-surface transition-colors hover:text-primary"
            >
              Explore All Franchises
              <Icon name="arrow_forward" className="text-[18px]" />
            </Link>
          </div>

          {franchiseePlans.length === 0 ? (
            <EmptyState
              icon="domain_disabled"
              title="No Franchisee Opportunities Yet"
              body="The Admin has not configured any Franchisee Plans yet. Please check back soon."
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {franchiseePlans.map((fp) => (
                <div
                  key={fp.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl bg-surface-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container text-primary">
                        <Icon name="school" className="text-[24px]" />
                      </div>
                      <h3 className="font-heading text-base font-semibold text-on-surface">
                        {fp.name}
                      </h3>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
                      <span className="text-xs text-on-surface-variant">One-Time Deductible</span>
                      <span className="text-lg font-bold text-on-surface">
                        {formatINR(fp.oneTimeDeductiblePrice)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                        Associated Partner Colleges
                      </span>
                      <div className="flex flex-col gap-1">
                        {fp.collegeMappings.length === 0 ? (
                          <span className="text-xs text-on-surface-variant">No colleges mapped yet.</span>
                        ) : (
                          fp.collegeMappings.map((m) => (
                            <div
                              key={m.collegeId}
                              className="flex items-center gap-2 rounded bg-surface-container px-2 py-1.5"
                            >
                              <Icon name="check_circle" className="text-[16px] text-secondary" />
                              <span className="text-sm text-on-surface">{m.college.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                  <Link
                    href="/login"
                    className="flex min-h-touch w-full items-center justify-center gap-1 rounded-xl bg-surface-container text-sm font-medium text-on-surface transition-all hover:bg-surface-container-high"
                  >
                    Review Franchise Terms
                    <Icon name="arrow_forward" className="text-[18px]" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Closing CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-primary-container p-8 text-center shadow-lg sm:p-12">
            <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-4">
              <span className="rounded-full bg-surface-container-high/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-inverse-on-surface">
                Instant Onboarding
              </span>
              <h2 className="font-heading text-2xl font-bold tracking-tight text-inverse-on-surface sm:text-3xl">
                Ready to get started?
              </h2>
              <p className="text-base text-inverse-on-surface/80">
                Create your verified investor account in minutes. Unlock full tenure projections,
                flexible AutoPay schedules, and institutional college affiliations.
              </p>
              <div className="flex w-full flex-col items-center gap-3 pt-1 sm:w-auto sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex min-h-touch w-full items-center justify-center gap-1 rounded-xl bg-inverse-on-surface px-8 text-sm font-medium text-primary-container shadow-md transition-all hover:bg-surface-container sm:w-auto"
                >
                  Register Now
                  <Icon name="arrow_forward" className="text-[18px]" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex min-h-touch w-full items-center justify-center rounded-xl bg-primary-container/80 px-6 text-sm font-medium text-inverse-on-surface shadow-sm transition-all hover:bg-primary-container sm:w-auto"
                >
                  Existing Investor Login
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant/40 bg-surface-container-low">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-sm text-on-surface-variant sm:flex-row">
            <p>© {new Date().getFullYear()} NexVest. Simulated transaction environment.</p>
            <div className="flex items-center gap-4">
              <Link href="/plans" className="hover:text-on-surface">
                Plans
              </Link>
              <Link href="/franchisee" className="hover:text-on-surface">
                Franchisee
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant">
        <Icon name={icon} className="text-[24px]" />
      </div>
      <p className="font-heading text-lg font-semibold text-on-surface">{title}</p>
      <p className="max-w-md text-sm text-on-surface-variant">{body}</p>
    </div>
  );
}
