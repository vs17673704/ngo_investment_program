import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ShellSidebar } from "@/components/ShellSidebar";
import { ShellMobileNav } from "@/components/ShellMobileNav";
import { RouteProgressBar } from "@/components/RouteProgressBar";
import { logoutAction } from "@/app/(auth)/actions";
import { AdminLiveEvents } from "@/components/admin/AdminLiveEvents";
import { PushOptIn } from "@/components/PushOptIn";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getPublishedTheme } from "@/lib/theme";
import { existingPublicAsset } from "@/lib/branding-assets";
import { navActiveClassName } from "@/components/ui/Button";

// Grouped for the sidebar/drawer (see ShellSidebar.tsx/ShellMobileNav.tsx's
// `group` handling): Overview standalone; People (accounts); Financial
// (anything moving money — plans, interest, commissions, autopay,
// redemptions); Catalog (admin-curated reference data editable but rarely
// touched day-to-day); Communications (inbound enquiries vs outbound
// emails). Audit Log/Reports/Settings/Account intentionally stay ungrouped
// (no shared "System" group) — direct links in both the sidebar and drawer.
const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "space_dashboard", exact: true, group: "Overview" },

  // groupIcon: only needs to be set on a group's first item — ShellSidebar's
  // desktop sidebar uses it as the icon for that group's collapsed row.
  { href: "/admin/users", label: "Users", icon: "group", group: "People", groupIcon: "groups" },
  { href: "/admin/referrers", label: "Referrers", icon: "diversity_3", group: "People" },

  {
    href: "/admin/plans",
    label: "Plans",
    icon: "account_balance_wallet",
    group: "Financial",
    groupIcon: "payments",
  },
  { href: "/admin/interest-methods", label: "Interest Methods", icon: "percent", group: "Financial" },
  { href: "/admin/commissions", label: "Commissions", icon: "military_tech", group: "Financial" },
  { href: "/admin/payments", label: "AutoPay Simulator", icon: "sync", group: "Financial" },
  { href: "/admin/redemptions", label: "Redemptions", icon: "currency_exchange", group: "Financial" },
  { href: "/admin/ledger", label: "Unified Ledger", icon: "receipt_long", group: "Financial" },

  {
    href: "/admin/catalog/universities-courses",
    label: "Universities & Courses",
    icon: "school",
    iconSizePx: 14.4,
    group: "Catalog",
    groupIcon: "inventory_2",
  },
  { href: "/admin/catalog/gadgets", label: "Gadgets", icon: "devices", group: "Catalog" },
  { href: "/admin/catalog/colleges", label: "Colleges", icon: "account_balance", group: "Catalog" },
  { href: "/admin/catalog/franchisee-plans", label: "Franchisee Plans", icon: "map", group: "Catalog" },
  {
    href: "/admin/catalog/donation-recipients",
    label: "Donation Recipients",
    icon: "volunteer_activism",
    group: "Catalog",
  },

  {
    href: "/admin/enquiries/general",
    label: "General Enquiries",
    icon: "contact_support",
    group: "Communications",
    groupIcon: "forum",
  },
  { href: "/admin/emails", label: "Emails", icon: "mail", group: "Communications" },

  { href: "/admin/audit-log", label: "Audit Log", icon: "history" },
  { href: "/admin/reports", label: "Reports", icon: "summarize" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
  { href: "/admin/account", label: "Account", icon: "person" },
];

export async function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetched here rather than threaded through as a prop from every one of the
  // ~19 admin pages that render this shell. Every /admin/* page already
  // requires an authenticated admin session before rendering, but this falls
  // back to 0 rather than throwing if that assumption is ever wrong.
  const session = await getSession();
  const [unreadNotificationCount, theme] = await Promise.all([
    session ? prisma.notification.count({ where: { userId: session.sub, isRead: false } }) : Promise.resolve(0),
    getPublishedTheme(),
  ]);
  const appName = theme.appName?.trim() || process.env.NEXT_PUBLIC_APP_NAME || "NexVest";
  const logoUrl = existingPublicAsset(theme.logoUrl);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <RouteProgressBar />
      {/* pt-[env(safe-area-inset-top)]: layout.tsx's viewportFit "cover" lets
          content draw under the status bar/notch on a real phone. Without
          this, the header's top-left corner — where the hamburger button
          sits — can render underneath that OS overlay, where the status bar
          (not the page) owns the touch; the rest of the header, further from
          the corner, isn't affected. OfflineBanner.tsx already compensates
          for the same viewportFit setting the same way. */}
      {/* Spacer: reserves the header's height in normal flow, since the
          actual header below is fixed (removed from flow) so it can't be
          knocked out of position by an ancestor's scroll/layout context —
          same technique as ShellSidebar.tsx's fixed aside + spacer. */}
      <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-top))]" />
      <header className="fixed top-0 right-0 left-0 z-40 border-b border-surface-container bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="flex h-14 w-full items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 shrink items-center gap-2">
            <ShellMobileNav
              ariaLabel="Admin Menu"
              navItems={NAV_ITEMS}
              activeClassName={navActiveClassName}
              inactiveClassName="text-on-surface-variant hover:bg-surface-container hover:text-primary"
            />
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={appName} className="h-7 w-auto shrink-0" />
            ) : (
              // See the matching comment in DashboardShell.tsx: without
              // truncate + min-w-0 here, a long theme.appName pushes the
              // header's right-side Log out button past the mobile
              // viewport's edge, off a fixed non-scrolling header.
              <span className="min-w-0 truncate font-heading text-lg font-bold tracking-tight text-primary">
                {appName}
              </span>
            )}
            <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-on-surface-variant sm:inline">
              Admin Dashboard
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/admin/notifications"
              aria-label={`Notifications (${unreadNotificationCount} unread)`}
              className="relative flex min-h-touch min-w-touch items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
            >
              <Icon name="notifications" className="text-[22px]" />
              {unreadNotificationCount > 0 ? (
                <span className="absolute top-2 right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold leading-none text-on-error">
                  {unreadNotificationCount}
                </span>
              ) : null}
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Log out"
                className="flex min-h-touch items-center gap-1 rounded-lg px-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error"
              >
                <Icon name="logout" className="text-[20px]" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="flex w-full flex-1 items-start">
        <ShellSidebar
          ariaLabel="Admin Navigation"
          navItems={NAV_ITEMS}
          activeClassName={navActiveClassName}
          inactiveClassName="text-on-surface-variant hover:bg-surface-container hover:text-primary"
        />

        <main className="flex w-full min-w-0 flex-1 flex-col gap-6 px-4 py-6">{children}</main>
      </div>
      <AdminLiveEvents />
      <PushOptIn />
    </div>
  );
}
