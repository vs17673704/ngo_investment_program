"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Two different caches can make Back/Forward show a stale, session-dependent
// page instead of re-checking auth on the server:
//
// 1. The browser's own back-forward cache (bfcache) can restore a fully
//    rendered page — DOM, React state, everything — straight from memory,
//    without re-running any server component. This is a real page (re)load,
//    so it fires `pageshow` with `event.persisted === true`.
// 2. Next's client-side Router Cache serves its last-rendered RSC payload
//    for a route on Back/Forward instead of asking the server again, even
//    for a page that reads cookies(). This is NOT a page load at all (it's
//    handled internally via the History API), so `pageshow` never fires —
//    only `popstate` does.
//
// Cache-Control headers don't reliably prevent bfcache across browsers, and
// there's no header that opts a route out of #2, so both are handled the
// same way here: force router.refresh() to re-run the current route's
// server components, which already redirect based on session state (see
// dashboard/layout.tsx, admin/layout.tsx, login/page.tsx, app/page.tsx), so
// a stale snapshot is immediately replaced with the correct destination.
export default function BfcacheGuard() {
  const router = useRouter();

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        router.refresh();
      }
    }

    function handlePopState() {
      router.refresh();
    }

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [router]);

  return null;
}
