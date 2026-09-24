"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  // Optional section label (e.g. "Financial", "Catalog"). Consecutive items
  // sharing a group collapse into a single hoverable row (see `Row` below);
  // a group with only one item, or no group at all, renders as a normal
  // link (e.g. DashboardShell's flat list, or Admin's standalone Dashboard).
  group?: string;
  // Icon for the collapsed group's own row. Only needs to be set on a
  // group's first item — later items in the same group don't need it.
  // Falls back to that first item's own icon if omitted.
  groupIcon?: string;
};

type Row = { kind: "item"; item: NavItem } | { kind: "group"; name: string; icon: string; items: NavItem[] };

function buildRows(navItems: NavItem[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < navItems.length) {
    const item = navItems[i];
    if (!item.group) {
      rows.push({ kind: "item", item });
      i++;
      continue;
    }
    const groupItems: NavItem[] = [];
    let j = i;
    while (j < navItems.length && navItems[j].group === item.group) {
      groupItems.push(navItems[j]);
      j++;
    }
    rows.push(
      groupItems.length > 1
        ? { kind: "group", name: item.group, icon: item.groupIcon ?? item.icon, items: groupItems }
        : { kind: "item", item },
    );
    i = j;
  }
  return rows;
}

const STORAGE_KEY = "shell-sidebar-collapsed";
// Closing on a short delay (rather than instantly on mouseleave) lets the
// pointer cross the small gap between a group row and the submenu beside it
// without the submenu disappearing first.
const SUBMENU_CLOSE_DELAY_MS = 150;

// Desktop-only vertical sidebar (the `lg:` breakpoint and up), replacing the
// old horizontal nav bar. Below `lg`, ShellMobileNav's hamburger drawer is
// used instead (unchanged, no hover concept) — this component is hidden
// there and renders every item flat under a text header. Collapse state is
// a per-viewer convenience persisted in localStorage, so it starts expanded
// on every render (including SSR) and only flips to the remembered state
// once mounted client-side.
export function ShellSidebar({
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
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const rows = useMemo(() => buildRows(navItems), [navItems]);

  const [submenu, setSubmenu] = useState<{ name: string; top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Private browsing / blocked storage — keep the default expanded state.
    }
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore — collapsing still works for this render, just isn't persisted.
      }
      return next;
    });
  }

  function cancelSubmenuClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleSubmenuClose() {
    cancelSubmenuClose();
    closeTimer.current = setTimeout(() => setSubmenu(null), SUBMENU_CLOSE_DELAY_MS);
  }

  function openSubmenu(name: string, anchor: HTMLElement) {
    cancelSubmenuClose();
    const rect = anchor.getBoundingClientRect();
    setSubmenu({ name, top: rect.top, left: rect.right + 4 });
  }

  function toggleSubmenu(name: string, anchor: HTMLElement) {
    setSubmenu((prev) => {
      if (prev?.name === name) return null;
      const rect = anchor.getBoundingClientRect();
      return { name, top: rect.top, left: rect.right + 4 };
    });
  }

  function isItemActive(item: NavItem) {
    return pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));
  }

  const submenuRow = submenu ? rows.find((row) => row.kind === "group" && row.name === submenu.name) : undefined;
  const submenuItems = submenuRow?.kind === "group" ? submenuRow.items : [];

  return (
    <>
      {/* Spacer: reserves the sidebar's width in the row's normal flow, since
          the actual aside below is fixed (removed from flow) so it can stay
          on screen instead of scrolling away with the page. */}
      <div aria-hidden className={`hidden shrink-0 lg:block ${collapsed ? "w-16" : "w-56"}`} />
      <aside
        className={`fixed top-14 left-0 z-30 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-surface-container bg-surface-container-lowest transition-[width] lg:flex ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        <nav aria-label={ariaLabel} className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {rows.map((row) => {
            if (row.kind === "item") {
              return (
                <ShellNavLink
                  key={row.item.href}
                  href={row.item.href}
                  label={row.item.label}
                  icon={row.item.icon}
                  showLabel={!collapsed}
                  activeClassName={activeClassName}
                  inactiveClassName={inactiveClassName}
                  exact={row.item.exact}
                  wrap={row.item.wrap}
                  iconSizePx={row.item.iconSizePx}
                />
              );
            }
            const isGroupActive = row.items.some(isItemActive);
            const isOpen = submenu?.name === row.name;
            return (
              <button
                key={row.name}
                type="button"
                aria-haspopup="true"
                aria-expanded={isOpen}
                aria-label={collapsed ? row.name : undefined}
                title={collapsed ? row.name : undefined}
                onMouseEnter={(event) => openSubmenu(row.name, event.currentTarget)}
                onMouseLeave={scheduleSubmenuClose}
                onClick={(event) => toggleSubmenu(row.name, event.currentTarget)}
                className={`flex min-h-touch items-center gap-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  collapsed ? "justify-center px-0" : "px-3"
                } ${isGroupActive ? activeClassName : inactiveClassName}`}
              >
                <Icon name={row.icon} style={{ fontSize: "18px" }} />
                {!collapsed && <span className="flex-1 text-left">{row.name}</span>}
                {!collapsed && <Icon name="chevron_right" className="text-[16px]" />}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex min-h-touch shrink-0 items-center justify-center gap-1.5 border-t border-surface-container p-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
        >
          <Icon name={collapsed ? "chevron_right" : "chevron_left"} className="text-[18px]" />
          {!collapsed && "Collapse"}
        </button>
      </aside>

      {/* Portaled (like ShellMobileNav's drawer) so it isn't clipped by the
          sidebar nav's overflow-y-auto, and floats above page content. */}
      {submenu && submenuItems.length > 0
        ? createPortal(
            <div
              style={{ position: "fixed", top: submenu.top, left: submenu.left }}
              className="z-[999] min-w-44 rounded-lg border border-surface-container bg-surface-container-lowest p-1.5 shadow-xl"
              onMouseEnter={cancelSubmenuClose}
              onMouseLeave={scheduleSubmenuClose}
            >
              <div className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-on-surface-variant uppercase">
                {submenu.name}
              </div>
              <div className="flex flex-col gap-0.5">
                {submenuItems.map((item) => (
                  <ShellNavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    activeClassName={activeClassName}
                    inactiveClassName={inactiveClassName}
                    exact={item.exact}
                    wrap={item.wrap}
                    iconSizePx={item.iconSizePx}
                  />
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
