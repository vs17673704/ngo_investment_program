import { prisma } from "@/lib/prisma";
import { SiteNav } from "@/components/SiteNav";
import { DashboardShell } from "@/components/DashboardShell";
import { getSession } from "@/lib/auth/session";
import { getUserDashboardData } from "@/lib/dashboard";
import { Icon } from "@/components/Icon";
import { FranchiseeCatalog, type CatalogFranchiseePlan } from "@/components/FranchiseeCatalog";

export default async function FranchiseePage() {
  const [session, franchiseePlans] = await Promise.all([
    getSession(),
    prisma.franchiseePlan.findMany({
      include: { collegeMappings: { include: { college: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const isLoggedIn = Boolean(session && session.role === "USER");

  const catalogPlans: CatalogFranchiseePlan[] = franchiseePlans.map((fp) => ({
    id: fp.id,
    name: fp.name,
    oneTimeDeductiblePrice: fp.oneTimeDeductiblePrice.toString(),
    colleges: fp.collegeMappings.map((m) => m.college.name),
  }));

  const catalog = (
    <>
      <div className="mb-6 flex max-w-3xl flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded bg-secondary-container/60 px-2 py-1 text-xs font-semibold tracking-wider text-on-secondary-container uppercase">
            Franchisee Catalog
          </span>
          <span className="text-sm text-on-surface-variant">· Partner Institutions</span>
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-on-surface md:text-4xl">
          Available Franchisee Plans
        </h1>
        <p className="text-base leading-relaxed text-on-surface-variant">
          Browse available Franchisee Plans and their mapped partner colleges. Enrolled users can redeem available
          margin towards partner institutions.
        </p>
      </div>

      <div className="mb-6 flex items-start gap-4 rounded-xl border border-secondary-container bg-surface-container-lowest p-6 shadow-sm">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary-container/40 text-secondary">
          <Icon name="info" className="text-[24px]" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-heading text-sm font-semibold text-on-surface">How Franchisee Redemption Works</span>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Existing investors can apply their Available Margin towards a Franchisee Plan and select one
            associated college. If the One-Time Deductible Price exceeds your Available Margin, an enquiry is
            created in <strong className="font-medium text-on-surface">Awaiting Shortfall Resolution</strong> for
            verified offline settlement without premature balance debits.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <FranchiseeCatalog plans={catalogPlans} isLoggedIn={isLoggedIn} />
      </div>
    </>
  );

  if (session && session.role === "USER") {
    const data = await getUserDashboardData(session.sub);
    return (
      <DashboardShell
        email={data.user.email}
        referralCode={data.user.referralCode}
        unreadNotificationCount={data.unreadNotificationCount}
      >
        <div className="mx-auto w-full max-w-6xl flex-1">{catalog}</div>
      </DashboardShell>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{catalog}</main>
    </div>
  );
}
