"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";

export function ShellNavLink({
  href,
  label,
  icon,
  activeClassName,
  inactiveClassName,
  showLabel = true,
  exact = false,
  wrap = false,
  iconSizePx = 18,
}: {
  href: string;
  label: string;
  icon: string;
  activeClassName: string;
  inactiveClassName: string;
  showLabel?: boolean;
  // "/dashboard" (unlike every other nav item's href) is also a path-prefix
  // of its own sibling routes ("/dashboard/referrals" etc.), so the default
  // startsWith match would light up "Dashboard" alongside whichever sibling
  // is actually active. Pass exact for any nav item whose href is a prefix
  // of another item's href in the same list.
  exact?: boolean;
  // Long labels default to a single nowrap line, which overflows the fixed-
  // width sidebar and makes it horizontally scrollable. Pass wrap for a nav
  // item whose label is too long to fit on one line at the sidebar's width.
  wrap?: boolean;
  // Per-item icon size override, in px. Defaults to the standard 18px.
  iconSizePx?: number;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (!exact && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      aria-label={showLabel ? undefined : label}
      title={showLabel ? undefined : label}
      className={`flex min-h-touch items-center gap-1.5 rounded-lg text-sm font-medium transition-colors ${
        wrap ? "leading-tight whitespace-normal" : "whitespace-nowrap"
      } ${showLabel ? "px-3" : "justify-center px-0"} ${isActive ? activeClassName : inactiveClassName}`}
    >
      <Icon name={icon} style={{ fontSize: `${iconSizePx}px` }} />
      {showLabel && label}
    </Link>
  );
}
