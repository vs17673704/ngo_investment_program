import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next's default dynamic-route response is `Cache-Control: no-cache,
  // must-revalidate` (confirmed via curl against these routes). That's
  // supposed to force revalidation before reuse, but Chrome's Back/Forward
  // history navigation doesn't reliably honor it — it can still serve the
  // disk-cached HTML from before a login/logout without a network request at
  // all (verified: the server-side session-check log for these routes did
  // NOT fire on the back-navigation that showed stale content). `no-store`
  // is the one directive that's respected for history navigation too, so
  // these session-dependent routes get it explicitly.
  async headers() {
    const noStore = [{ key: "Cache-Control", value: "no-store" }];
    return [
      { source: "/", headers: noStore },
      { source: "/login", headers: noStore },
      { source: "/register", headers: noStore },
      { source: "/verify-2fa", headers: noStore },
      { source: "/reset-password", headers: noStore },
      { source: "/forgot-password", headers: noStore },
      { source: "/dashboard/:path*", headers: noStore },
      { source: "/admin/:path*", headers: noStore },
    ];
  },
  experimental: {
    serverActions: {
      // The largest branding asset the app itself allows is the login
      // wallpaper at 5MB (see src/lib/branding-assets.ts MAX_BYTES). Next.js's
      // default Server Action body limit is 1MB, which is below that and even
      // below the multipart-encoded size of some assets right at their own
      // 1MB limit — without this, uploads near/above those sizes crash with
      // an unhandled framework "Body exceeded 1 MB limit" error instead of
      // the app's own graceful "File is too large" validation message.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
