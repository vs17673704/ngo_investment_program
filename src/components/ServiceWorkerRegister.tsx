"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Registration is skipped in dev by default because the service worker's
    // cache-first strategy for static/build assets would otherwise serve
    // stale chunks across Turbopack rebuilds. NEXT_PUBLIC_ENABLE_SW_IN_DEV
    // opts back in for dev-only testing of things that require an active
    // service worker (e.g. Firebase Cloud Messaging — see src/components/PushOptIn.tsx).
    const enabledInDev = process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV === "true";
    if (process.env.NODE_ENV !== "production" && !enabledInDev) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
