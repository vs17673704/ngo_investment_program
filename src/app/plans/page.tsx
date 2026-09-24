import { prisma } from "@/lib/prisma";
import { SiteNav } from "@/components/SiteNav";
import { DashboardShell } from "@/components/DashboardShell";
import { getSession } from "@/lib/auth/session";
import { getUserDashboardData } from "@/lib/dashboard";
import { PlansCatalog, type CatalogPlan } from "@/components/PlansCatalog";

export default async function PlansPage() {
  const session = await getSession();

  // A discontinued plan is normally hidden from the catalog entirely, but a
  // user already enrolled in one should still see its details here (they
  // just can't start a new subscription to it — see isSubscribable below).
  const enrolledPlanIds =
    session && session.role === "USER"
      ? (
          await prisma.userPlan.findMany({
            where: { userId: session.sub },
            select: { planId: true },
            distinct: ["planId"],
          })
        ).map((up) => up.planId)
      : [];

  const plans = await prisma.plan.findMany({
    where: enrolledPlanIds.length > 0 ? { OR: [{ status: "ACTIVE" }, { id: { in: enrolledPlanIds } }] } : { status: "ACTIVE" },
    include: { interestMethod: true },
    orderBy: { createdAt: "asc" },
  });

  const catalogPlans: CatalogPlan[] = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    tenureMonths: plan.tenureMonths,
    paymentFrequency: plan.paymentFrequency,
    presetAmounts: plan.presetAmounts.map((a) => a.toString()),
    ratePercent: plan.interestMethod.ratePercent.toString(),
    formulaType: plan.interestMethod.formulaType,
    rewardPercent: plan.rewardPercent ? plan.rewardPercent.toString() : null,
    isSubscribable: plan.status === "ACTIVE",
  }));

  const catalog = (
    <>
      <section className="mb-4 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="flex max-w-2xl flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded bg-secondary-container/40 px-2 py-1 text-xs font-semibold tracking-wider text-on-secondary-container uppercase">
              Investment Catalog
            </span>
            <span className="flex items-center gap-1 text-xs text-on-surface-variant">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" /> Verified Investment Plans
            </span>
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-on-surface md:text-4xl">
            Available Investment Plans
          </h1>
          <p className="mt-1 text-base text-on-surface-variant">
            Choose a plan to start automated AutoPay contributions, earn interest upon maturity, and build course
            reward points.
          </p>
        </div>
      </section>

      <PlansCatalog plans={catalogPlans} />
    </>
  );

  // Signed-in Users get this catalog inside the dashboard shell (same
  // header/nav as the rest of /dashboard/*); everyone else (logged-out
  // visitors, and Admins, who have their own console) sees the public
  // SiteNav-shelled page.
  if (session && session.role === "USER") {
    const data = await getUserDashboardData(session.sub);
    return (
      <DashboardShell
        email={data.user.email}
        referralCode={data.user.referralCode}
        unreadNotificationCount={data.unreadNotificationCount}
      >
        <div className="w-full flex-1">{catalog}</div>
      </DashboardShell>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteNav />
      <main className="w-full flex-1 px-4 py-10 sm:px-6">{catalog}</main>
    </div>
  );
}
