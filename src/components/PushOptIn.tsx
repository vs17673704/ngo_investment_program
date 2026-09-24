"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { getFirebaseMessaging } from "@/lib/firebase/client";

// Master Prompt.md §33: FCM push is delivered to regular Users (8 event
// types) as well as Admins (General Enquiry Received), so this opt-in is a
// single shared component mounted in both DashboardShell and AdminShell —
// not an admin-only feature.

const DISMISSED_KEY = "push-opt-in-dismissed";

async function sendTokenToServer(fcmToken: string) {
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fcmToken, platform: navigator.platform || undefined }),
  });
}

async function subscribeToPush() {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) return;

  const messaging = await getFirebaseMessaging();
  if (!messaging) return;

  const { getToken } = await import("firebase/messaging");
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return;

  await sendTokenToServer(token);
}

// Firebase Messaging only invokes the service worker's onBackgroundMessage
// (public/sw.js) when this tab is NOT focused. When the tab IS focused/open,
// the same payload is instead delivered here, to the page, via onMessage —
// and if nothing listens for it, it is silently dropped: messaging.send()
// still succeeds server-side (no error, no revocation), but no OS
// notification and nothing else visible ever happens. This listener is the
// foreground counterpart to sw.js's onBackgroundMessage handler, showing the
// same notification via the Notification API instead of
// registration.showNotification.
async function listenForForegroundMessages() {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};

  const { onMessage } = await import("firebase/messaging");
  return onMessage(messaging, (payload) => {
    if (Notification.permission !== "granted") return;

    const title = payload.notification?.title ?? "Notification";
    const body = payload.notification?.body ?? "";
    const link = payload.data?.link ?? "/dashboard/notifications";

    const notification = new Notification(title, { body, icon: "/icons/icon-192.png" });
    notification.onclick = () => {
      window.focus();
      window.location.href = link;
    };
  });
}

// BRD Rule XLII: an account that has explicitly opted out of push must not
// be silently re-subscribed just because the browser permission still
// happens to be "granted" from before. Fails open (treats as enabled) on any
// fetch error, consistent with push being best-effort everywhere else.
async function pushNotificationsEnabledOnServer(): Promise<boolean> {
  try {
    const res = await fetch("/api/push/subscribe");
    if (!res.ok) return true;
    const data = (await res.json()) as { enabled?: boolean };
    return data.enabled !== false;
  } catch {
    return true;
  }
}

async function currentPermissionState(): Promise<PermissionState> {
  // navigator.permissions.query is preferred over the legacy
  // Notification.permission property: it's the live, spec-current way to
  // read permission state (and, notably, the only one that reliably
  // reflects a permission granted via automation/CDP in headless Chromium —
  // Notification.permission can lag behind it there).
  try {
    const status = await navigator.permissions.query({ name: "notifications" as PermissionName });
    return status.state;
  } catch {
    return Notification.permission === "granted"
      ? "granted"
      : Notification.permission === "denied"
        ? "denied"
        : "prompt";
  }
}

export function PushOptIn() {
  const [supported, setSupported] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || typeof Notification === "undefined") {
      return;
    }
    // Read browser-only support after mount, not during the initial render:
    // computing it eagerly (e.g. via a useState initializer) would make the
    // client's first render diverge from the server-rendered HTML (where
    // `navigator`/`window` don't exist), causing a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(true);

    Promise.all([currentPermissionState(), pushNotificationsEnabledOnServer()]).then(
      ([state, enabled]) => {
        if (!enabled) return;

        if (state === "granted") {
          subscribeToPush().catch(() => {});
          return;
        }

        if (state === "denied") {
          return;
        }

        if (sessionStorage.getItem(DISMISSED_KEY)) {
          return;
        }

        setVisible(true);
      },
    );
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || typeof Notification === "undefined") {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    listenForForegroundMessages().then((unsub) => {
      if (cancelled) {
        unsub();
        return;
      }
      unsubscribe = unsub;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  if (!supported || !visible) return null;

  const enable = async () => {
    const permission = await Notification.requestPermission();
    setVisible(false);
    sessionStorage.setItem(DISMISSED_KEY, "1");
    if (permission === "granted") {
      await subscribeToPush().catch(() => {});
    }
  };

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(DISMISSED_KEY, "1");
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border border-surface-container bg-surface-container-high px-3 py-2 shadow-lg">
      <Icon name="notifications" className="mt-0.5 shrink-0 text-[18px] text-primary" />
      <div className="flex-1">
        <p className="text-sm font-medium text-on-surface-variant">
          Get notified even when this tab is closed
        </p>
        <button
          type="button"
          onClick={enable}
          className="mt-1 text-sm font-semibold text-primary hover:underline"
        >
          Enable notifications
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-on-surface-variant opacity-70 hover:opacity-100"
      >
        <Icon name="close" className="text-[16px]" />
      </button>
    </div>
  );
}
