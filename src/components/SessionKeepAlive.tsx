"use client";

import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 25 * 60 * 1000;

// Drives refresh-token rotation from the client, since a logged-out visitor
// makes this a harmless no-op 401 rather than an error worth surfacing.
export default function SessionKeepAlive() {
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
