"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";

type NavItem = { href: string; label: string };

// Mobile hamburger drawer for the public marketing header (SiteNav.tsx).
// Only surfaces what's actually unreachable at narrow widths: the nav-links
// list (hidden below md) and, for a signed-out visitor, "Login" (hidden
// below sm). "Register"/"Dashboard" are never hidden by SiteNav at any
// width, so they're deliberately not duplicated here.
export function SiteMobileNav({ navItems, showLogin }: { navItems: NavItem[]; showLogin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="flex min-h-touch min-w-touch touch-manipulation items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
      >
        <Icon name="menu" className="text-[24px]" />
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[999] flex justify-end">
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-black/50"
              />
              <nav
                aria-label="Site navigation"
                className="relative flex h-full w-72 max-w-[85vw] flex-col gap-1 overflow-y-auto bg-surface-container-lowest p-4 shadow-xl"
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation menu"
                  className="mb-2 flex min-h-touch min-w-touch items-center justify-center self-end rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                >
                  <Icon name="close" className="text-[24px]" />
                </button>
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-3 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                  >
                    {item.label}
                  </Link>
                ))}
                {showLogin ? (
                  <Link
                    href="/login"
                    className="mt-4 flex min-h-touch items-center justify-center rounded-xl border border-outline-variant/60 px-5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
                  >
                    Login
                  </Link>
                ) : null}
              </nav>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
