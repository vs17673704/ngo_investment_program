import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ShellSidebar } from "@/components/ShellSidebar";
import { ShellMobileNav } from "@/components/ShellMobileNav";
import { RouteProgressBar } from "@/components/RouteProgressBar";
import { logoutAction } from "@/app/(auth)/actions";
import { PushOptIn } from "@/components/PushOptIn";
import { getPublishedTheme } from "@/lib/theme";
import { existingPublicAsset } from "@/lib/branding-assets";
import { CopyButton } from "@/components/CopyButton";
import { navActiveClassName } from "@/components/ui/Button";

// Plans, Franchisee, Contact Us and About Us are the same public-catalog
// pages linked from the home page (see SiteNav.tsx) — for a signed-in User
// they render within this shell instead of the public SiteNav (see
// src/app/plans/page.tsx, franchisee/page.tsx, contact/page.tsx,
// about/page.tsx), so they belong in this nav rather than "Browse Plans"
// pointing to an out-of-shell page.
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "space_dashboard", exact: true },
  { href: "/plans", label: "Plans", icon: "explore" },
  { href: "/franchisee", label: "Franchisee", icon: "school" },
  { href: "/dashboard/referrals", label: "Referrals", icon: "group_add" },
  { href: "/dashboard/redeem", label: "Redeem Hub", icon: "payments" },
  { href: "/dashboard/payments", label: "Payments", icon: "receipt_long" },
  { href: "/dashboard/account", label: "Account", icon: "settings" },
  { href: "/contact", label: "Contact Us", icon: "mail" },
];

export async function DashboardShell({
  email,
  referralCode,
  unreadNotificationCount,
  children,
}: {
  email: string;
  referralCode: string;
  unreadNotificationCount: number;
  children: React.ReactNode;
}) {
  const theme = await getPublishedTheme();
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
        <div className="flex h-14 w-full items-center gap-3 px-4">
          <div className="flex min-w-0 shrink items-center gap-2">
            <ShellMobileNav
              ariaLabel="Dashboard Navigation"
              navItems={NAV_ITEMS}
              activeClassName={navActiveClassName}
              inactiveClassName="text-on-surface hover:bg-surface-container"
            />
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={appName} className="h-7 w-auto shrink-0" />
            ) : (
              // truncate + min-w-0 (on this wrapping flex item): without
              // these, a long configurable theme.appName (e.g. "Referral &
              // Reward Program") has no way to shrink below its intrinsic
              // text width, so at the mobile viewport (390px) it pushes the
              // header's right-side icon group (notifications/account/Log
              // out) past the edge of a fixed, non-scrolling header — those
              // controls become genuinely unreachable, not just visually
              // cramped.
              <span className="min-w-0 truncate font-heading text-lg font-bold tracking-tight text-primary">
                {appName}
              </span>
            )}
            <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-on-surface-variant lg:inline">
              Investor Portal
            </span>
          </div>
          {/* Session info: kept in this same h-14 row (rather than a second
              stacked row) so the header is a single line on desktop. flex-1 +
              min-w-0 + overflow-hidden let it shrink/ellipsize under the fixed-
              width logo and icon groups instead of wrapping. */}
          <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 overflow-hidden text-sm whitespace-nowrap md:flex">
            <div className="flex min-w-0 items-center gap-1.5 text-on-surface">
              <Icon name="verified_user" className="shrink-0 text-[18px] text-on-surface-variant" />
              <span className="truncate">
                Logged in as <strong className="font-semibold text-primary">{email}</strong>
              </span>
            </div>
            <span className="shrink-0 text-outline-variant select-none">/</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-on-surface-variant">Referral Code:</span>
              <CopyButton value={referralCode} label="Copy referral code" />
              <span className="rounded bg-surface-container px-2 py-0.5 font-mono text-xs font-semibold tracking-wider text-primary">
                {referralCode}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/dashboard/notifications"
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
            <Link
              href="/dashboard/account"
              aria-label="Account"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary transition-colors hover:bg-primary-container"
            >
              {email.slice(0, 2).toUpperCase()}
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
          ariaLabel="Dashboard Quick Navigation"
          navItems={NAV_ITEMS}
          activeClassName={navActiveClassName}
          inactiveClassName="text-on-surface hover:bg-surface-container"
        />

        <main className="flex w-full min-w-0 flex-1 flex-col gap-6 px-4 py-6">
          {children}
        </main>
      </div>
      <PushOptIn />
    </div>
  );
}
