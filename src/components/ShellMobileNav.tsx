"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ShellNavLink } from "@/components/ShellNavLink";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  wrap?: boolean;
  iconSizePx?: number;
  // See ShellSidebar.tsx's NavItem — same optional section label.
  group?: string;
};

// Collapsible hamburger side menu for mobile/tablet screens (below the `lg`
// breakpoint) — the desktop horizontal nav bar stays as-is and is hidden at
// these sizes by the caller; this renders instead. Shared by AdminShell and
// DashboardShell so both shells get identical drawer behavior.
export function ShellMobileNav({
  ariaLabel,
  navItems,
  activeClassName,
  inactiveClassName,
}: {
  ariaLabel: string;
  navItems: NavItem[];
  activeClassName: string;
  inactiveClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close the drawer on navigation. Adjusted during render (React's
  // documented pattern for resetting state in response to a prop change)
  // rather than in an effect, to avoid an extra render pass.
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
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        // touch-manipulation: without it, mobile Chrome can hold a tap here
        // for a couple hundred ms waiting to see if a second tap makes this a
        // double-tap-to-zoom gesture (the header's flex row of small controls
        // looks tap-zoomable), and on some real devices that ambiguity can
        // eat the tap entirely instead of always resolving to a click —
        // Playwright's synthetic click() never exercises this path, which is
        // why it never showed up in tests.
        className="flex min-h-touch min-w-touch touch-manipulation items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
      >
        <Icon name="menu" className="text-[24px]" />
      </button>

      {open
        ? createPortal(
            // Portaled to document.body: AdminShell/DashboardShell's header
            // has `backdrop-blur-xl`, and a `backdrop-filter` on an ancestor
            // makes `position: fixed` descendants position relative to that
            // ancestor's box instead of the viewport — without the portal,
            // this drawer would render squeezed inside the ~56px header
            // instead of covering the screen (invisible/broken on real
            // devices, since Playwright's toBeVisible() doesn't check
            // whether an element is actually within the viewport).
            // z-[999], not z-50: a real device's browser chrome/PWA layers
            // aside, z-50 also matches OfflineBanner's z-index elsewhere in
            // this app — bumping this comfortably above every other
            // stacking context in the app removes any doubt this drawer
            // could end up visually beneath something else.
            <div className="fixed inset-0 z-[999] flex">
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="absolute inset-0 bg-black/50"
              />
              <nav
                aria-label={ariaLabel}
                className="relative flex h-full w-72 max-w-[85vw] flex-col gap-1 overflow-y-auto bg-surface-container-lowest p-3 shadow-xl"
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation menu"
                  className="mb-2 flex min-h-touch min-w-touch items-center justify-center self-end rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                >
                  <Icon name="close" className="text-[24px]" />
                </button>
                {navItems.map((item, index) => {
                  const isNewGroup = !!item.group && item.group !== navItems[index - 1]?.group;
                  return (
                    <Fragment key={item.href}>
                      {isNewGroup && (
                        <div
                          className={`px-3 pb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase ${
                            index > 0 ? "mt-3" : ""
                          }`}
                        >
                          {item.group}
                        </div>
                      )}
                      <ShellNavLink
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        activeClassName={activeClassName}
                        inactiveClassName={inactiveClassName}
                        exact={item.exact}
                        wrap={item.wrap}
                        iconSizePx={item.iconSizePx}
                      />
                    </Fragment>
                  );
                })}
              </nav>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
