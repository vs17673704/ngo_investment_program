import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getAdminDashboardData } from "@/lib/dashboard";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";

type StatCard = {
  label: string;
  value: string | number;
  icon: string;
  href?: string;
  linkLabel?: string;
  tone?: "default" | "error";
};

const TONE_CHIP_CLASSES: Record<NonNullable<StatCard["tone"]>, string> = {
  default: "bg-surface-container text-on-surface",
  error: "bg-error-container text-error",
};

function StatCardGrid({ title, stats }: { title: string; stats: StatCard[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-4 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  TONE_CHIP_CLASSES[stat.tone ?? "default"]
                }`}
              >
                <Icon name={stat.icon} className="text-[20px]" />
              </div>
              {stat.href ? (
                <Link
                  href={stat.href}
                  className="flex min-h-touch items-center gap-0.5 rounded-lg px-1 text-xs font-medium text-primary transition-colors hover:underline"
                >
                  {stat.linkLabel ?? "Manage"}
                  <Icon name="arrow_forward" className="text-[14px]" />
                </Link>
              ) : null}
            </div>
            <p className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">{stat.label}</p>
            <p className="text-xl font-bold tracking-tight text-primary">{stat.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [
    userCount,
    activePlanCount,
    planCount,
    pendingRedemptionCount,
    pendingEnquiryCount,
    pendingGeneralEnquiryCount,
    adminData,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "USER" } }),
    prisma.userPlan.count({ where: { status: "ACTIVE" } }),
    prisma.plan.count(),
    prisma.redemptionRequest.count({ where: { status: "PENDING" } }),
    prisma.franchiseeRedemptionEnquiry.count({ where: { status: "PENDING" } }),
    prisma.generalEnquiry.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }),
    getAdminDashboardData(),
  ]);

  const growthStats: StatCard[] = [
    { label: "Total Users", value: userCount, icon: "group", href: "/admin/users" },
    {
      label: "Active Subscriptions",
      value: activePlanCount,
      icon: "account_balance_wallet",
      href: "/admin/plans",
    },
    { label: "Plans Configured", value: planCount, icon: "checklist", href: "/admin/plans" },
    {
      label: "Upcoming Maturities (30d)",
      value: adminData.upcomingMaturityCount,
      icon: "event_upcoming",
    },
  ];

  const actionQueueStats: StatCard[] = [
    {
      label: "Pending Redemptions",
      value: pendingRedemptionCount,
      icon: "currency_exchange",
      href: "/admin/redemptions",
    },
    {
      label: "Pending Franchisee Enquiries",
      value: pendingEnquiryCount,
      icon: "storefront",
      href: "/admin/redemptions",
    },
    {
      label: "Pending General Enquiries",
      value: pendingGeneralEnquiryCount,
      icon: "contact_support",
      href: "/admin/enquiries/general",
    },
    {
      label: "Pending Refunds",
      value: adminData.pendingRefundCount,
      icon: "undo",
      href: "/admin/redemptions",
    },
  ];

  const paymentsHealthStats: StatCard[] = [
    {
      label: "Failed Payments",
      value: adminData.failedPaymentCount,
      icon: "error",
      href: "/admin/payments",
      tone: "error",
    },
  ];

  return (
    <>
      <AdminPageHeader title="Admin Dashboard" backToAdmin={false} />

      <section className="flex flex-col gap-4 rounded-xl bg-primary p-5 text-on-primary shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <Icon name="trending_up" className="text-[20px]" />
          <p className="text-xs font-semibold tracking-wider uppercase opacity-80">Revenue (Plan Payments)</p>
        </div>
        <p className="text-3xl font-bold tracking-tight sm:text-4xl">₹{adminData.revenue.toFixed(2)}</p>
        <div className="grid grid-cols-1 gap-3 border-t border-on-primary/20 pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase opacity-80">Referral Payout (Withdrawn)</p>
            <p className="text-lg font-semibold">₹{adminData.referralPayout.toFixed(2)}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase opacity-80">Today&apos;s Payments</p>
            <p className="text-lg font-semibold">
              {adminData.todaysPaymentCount} (₹{adminData.todaysPaymentTotal.toFixed(2)})
            </p>
          </div>
        </div>
      </section>

      <StatCardGrid title="Growth & Plans" stats={growthStats} />
      <StatCardGrid title="Action Queue" stats={actionQueueStats} />
      <StatCardGrid title="Payments Health" stats={paymentsHealthStats} />

      <section className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Icon name="notifications_active" className="text-[20px] text-on-surface-variant" />
          <h2 className="text-sm font-semibold text-on-surface">Admin Notifications</h2>
        </div>
        <p className="text-sm text-on-surface-variant">
          Push notifications for admin events are delivered via Firebase Cloud Messaging to your registered
          browser/device. If a push fails to deliver, the notification still remains available in-app.
        </p>
        <Link
          href="/admin/notifications"
          className="flex min-h-touch w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View all notifications
          <Icon name="arrow_forward" className="text-[16px]" />
        </Link>
      </section>
    </>
  );
}
