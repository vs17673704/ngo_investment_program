import { SwaggerUIEmbed } from "@/components/SwaggerUIEmbed";

// Access to this page is gated in src/proxy.ts via HTTP Basic Auth
// (API_DOCS_USERNAME / API_DOCS_PASSWORD), independent of the app's normal
// user/admin session — this is developer-facing documentation, not an
// in-app feature, so it deliberately does not require a platform account.
export default function ApiDocsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-6">
      <h1 className="font-heading text-2xl font-bold text-on-surface">API Docs</h1>
      <p className="text-sm text-on-surface-variant">
        OpenAPI documentation for this app&apos;s HTTP route handlers (
        <code>src/app/api/**/route.ts</code>). Most user actions in this app are Next.js Server
        Actions rather than REST endpoints, so only the endpoints that are genuinely callable over
        HTTP — file/report exports, the refresh-token endpoint, push-subscription management, the
        admin live-event stream, and donation receipts — are listed here. The raw spec is also
        available at{" "}
        <a href="/openapi.yaml" className="text-primary underline">
          /openapi.yaml
        </a>
        . See <code>README.md</code> for a plain-text endpoint catalog with sample
        requests/responses.
      </p>
      <SwaggerUIEmbed specUrl="/openapi.yaml" />
    </main>
  );
}
