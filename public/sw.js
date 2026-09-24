// Plain, hand-written service worker (no Workbox).
//
// Caching policy:
// - A small set of static shell assets (/, the manifest, and the PWA icons)
//   are cache-first with network fallback.
// - Anything under /_next/static/ is network-first with cache fallback (not
//   cache-first). In a production build these chunk filenames are
//   content-hashed, so network-first costs nothing extra there. In Turbopack
//   dev (see NEXT_PUBLIC_ENABLE_SW_IN_DEV in ServiceWorkerRegister.tsx),
//   chunk filenames stay stable across rebuilds while their contents change
//   — cache-first previously meant a browser with the service worker
//   installed could keep serving a pre-rebuild CSS/JS chunk indefinitely,
//   which is exactly what caused some elements on a page to render with an
//   older stylesheet than others (e.g. inconsistent button corner radii)
//   after a rebuild. Network-first still falls back to the cache when
//   offline.
// - Everything else (dashboard, admin, api, auth routes, and any other
//   dynamic route) always goes straight to the network. We never cache or
//   serve stale authenticated/private data, and we never fabricate a fake
//   "offline success" response — if the network fetch fails and there's no
//   cache entry, the failure propagates normally so the app's own offline UI
//   (see src/components/OfflineBanner.tsx) can react to it.

// Bumped from static-v2: "/" used to be cache-first-precached below, but its
// HTML embeds the signed-in/signed-out nav (see SiteNav.tsx), so a browser
// that ever cached it kept showing that same login state forever — logging
// out (or in) never changed what "/" rendered until the cache was cleared.
// Bumping the name deletes that stale cache outright rather than leaving the
// old entry to linger under a still-matching name.
const CACHE_NAME = "static-v3";

const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

// Paths that must always be served from the network — never cached — because
// they carry authenticated/private or otherwise dynamic data.
const NETWORK_ONLY_PREFIXES = [
  "/dashboard",
  "/admin",
  "/api/",
  "/login",
  "/register",
  "/verify-2fa",
  "/reset-password",
  "/forgot-password",
];

function isNetworkOnly(pathname) {
  return NETWORK_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

function isPrecachedShellAsset(pathname) {
  return PRECACHE_URLS.includes(pathname);
}

function isBuildAsset(pathname) {
  return pathname.startsWith("/_next/static/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  // Authenticated/private/dynamic routes: always network, never cached.
  if (isNetworkOnly(url.pathname)) {
    return;
  }

  // Static shell assets (app shell, manifest, icons): cache-first, network
  // fallback, populating the cache on successful network fetches. These are
  // fingerprint-free URLs we control the contents of via PRECACHE_URLS, so
  // staleness isn't a concern the way it is for build assets below.
  if (isPrecachedShellAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request).then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Next.js build assets (JS/CSS chunks): network-first, cache fallback.
  // See the caching-policy comment at the top of this file for why this is
  // NOT cache-first.
  if (isBuildAsset(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Everything else: go straight to the network, no caching. If it fails,
  // let the failure propagate — no fabricated offline responses.
});

// Master Prompt.md §29: Firebase Messaging is integrated into this same,
// already-registered service worker (not a second worker at the same
// scope) so background push and the existing cache/offline logic above
// coexist without conflict. The config values below are the public Firebase
// Web config (see firebase_prerequisites/Firebase_Config_Details.txt) —
// these identify the project to Google's client SDKs and are not secrets,
// unlike the Admin SDK service-account credentials used server-side in
// src/lib/firebase/admin.ts.
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAar4S82_Lc3enFXNUIpLjLeiJURxU2tg0",
  authDomain: "nextvest-93730.firebaseapp.com",
  projectId: "nextvest-93730",
  storageBucket: "nextvest-93730.firebasestorage.app",
  messagingSenderId: "295407231445",
  appId: "1:295407231445:web:8346a175fb281cd89e5d5c",
});

const messaging = firebase.messaging();

// Background FCM delivery: shows an OS-level notification even when no tab
// is open. The payload comes from src/lib/push/fcm.ts via
// src/lib/providers/notification.ts's createNotification().
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Notification";
  const body = (payload.notification && payload.notification.body) || "";
  const link = (payload.data && payload.data.link) || "/dashboard/notifications";

  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { link },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/dashboard/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).pathname === link);
      if (existing) return existing.focus();
      return self.clients.openWindow(link);
    })
  );
});
