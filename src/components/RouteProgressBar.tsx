"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// App Router has no `router.events`-style API (see next/dist/docs's use-router.md
// "Router events" example) — the only way to detect a route-change's start is a
// capture-phase click listener on internal links, and its end is a
// usePathname()/useSearchParams() change, composed here the same way that doc's
// NavigationEvents example does (hence the same Suspense-boundary requirement,
// since useSearchParams() forces client rendering up to the nearest one).
function ProgressWatcher({ onNavigationSettled }: { onNavigationSettled: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    onNavigationSettled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}

export function RouteProgressBar() {
  const [active, setActive] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = window.location.href;
      if (destination.origin !== window.location.origin) return;
      if (destination.href.split("#")[0] === current.split("#")[0]) return;

      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      setActive(true);
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  function handleNavigationSettled() {
    // Brief delay so the bar's completion animation is perceptible even on a
    // near-instant navigation, instead of vanishing the instant it appears.
    hideTimeout.current = setTimeout(() => setActive(false), 150);
  }

  useEffect(() => {
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <ProgressWatcher onNavigationSettled={handleNavigationSettled} />
      </Suspense>
      <div
        aria-hidden
        className={`fixed top-0 left-0 z-[100] h-1.5 w-full transition-transform duration-300 ease-out ${
          active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
        }`}
        // Fixed color instead of the theme's `--color-primary` — that token is
        // admin-configurable (`/admin/theme`) and defaults to black, which made
        // this bar invisible against dark text/icons. A route-loading indicator
        // needs to stay visible regardless of the current brand color.
        style={{ transformOrigin: "left", backgroundColor: "#2563eb" }}
      />
    </>
  );
}
