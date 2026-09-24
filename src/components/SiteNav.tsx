import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SiteMobileNav } from "@/components/SiteMobileNav";
import { getPublishedTheme } from "@/lib/theme";
import { existingPublicAsset } from "@/lib/branding-assets";

const NAV_LINK =
  "rounded-lg px-3 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface";

// BRD Client Addendum: landing page nav menu — Home | Plans | Franchisee | Login | Register
// (Login/Register are swapped for Dashboard/Logout once a session exists, so a
// signed-in user browsing these public pages isn't shown a logged-out nav.)
// Design.md 5.13.C: About Us only appears once published content exists.
export async function SiteNav() {
  const [session, aboutUsPublishedCount, theme] = await Promise.all([
    getSession(),
    prisma.aboutUsSectionPublished.count(),
    getPublishedTheme(),
  ]);
  const appName = theme.appName?.trim() || process.env.NEXT_PUBLIC_APP_NAME || "NexVest";
  const logoUrl = existingPublicAsset(theme.logoUrl);

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/plans", label: "Plans" },
    { href: "/franchisee", label: "Franchisee" },
    { href: "/contact", label: "Contact Us" },
    ...(aboutUsPublishedCount > 0 ? [{ href: "/about", label: "About Us" }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-outline-variant/40 bg-surface/90 backdrop-blur-xl">
      <nav className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-heading text-xl font-semibold tracking-tight text-on-surface">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={appName} className="h-8 w-auto" />
          ) : (
            appName
          )}
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={NAV_LINK}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <SiteMobileNav navItems={navItems} showLogin={!session} />
          {session ? (
            <Link
              href={session.role === "ADMIN" ? "/admin" : "/dashboard"}
              className="flex min-h-touch items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-container"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden min-h-touch items-center justify-center rounded-xl bg-surface-container-lowest px-5 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container sm:inline-flex"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="flex min-h-touch items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-container"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
