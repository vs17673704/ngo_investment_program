import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import SessionKeepAlive from "@/components/SessionKeepAlive";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import OfflineBanner from "@/components/OfflineBanner";
import BfcacheGuard from "@/components/BfcacheGuard";
import { getPublishedTheme, buildThemeCss } from "@/lib/theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  // "optional" (default is "swap"): if the font isn't ready in time, the
  // page keeps the size-matched fallback for this render instead of
  // swapping mid-paint — avoids the visible flash from fallback to Inter
  // on a hard/cache-cleared reload, at the cost of occasionally staying on
  // the fallback for that one load on a very slow connection.
  display: "optional",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "optional",
});

export async function generateMetadata(): Promise<Metadata> {
  const theme = await getPublishedTheme();
  const appName = theme.appName?.trim() || "Referral & Reward Program";
  return {
    title: appName,
    description: "Invest, refer, and earn rewards.",
    manifest: "/manifest.webmanifest",
    ...(theme.faviconUrl ? { icons: { icon: theme.faviconUrl } } : {}),
  };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await getPublishedTheme();
  return {
    themeColor: theme.primaryColor,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await getPublishedTheme();
  const themeCss = buildThemeCss(theme);

  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          // display=block: the icon glyph renders invisible (rather than the raw
          // ligature text, e.g. "person") until the font loads, then swaps in —
          // avoids the visible name-then-icon flash that `swap` (the default) causes.
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
        {/* Server-rendered per request from the published ThemeConfig — overrides
            globals.css's static :root defaults via cascade order, so there is no
            client-side theme fetch, no flash of default styling, and no hydration
            mismatch (the value is identical on server and client for this request). */}
        <style id="theme-overrides" dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body className="min-h-full flex flex-col bg-surface text-on-surface">
        <OfflineBanner />
        <BfcacheGuard />
        <SessionKeepAlive />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
