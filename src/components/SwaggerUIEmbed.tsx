"use client";

import { useEffect, useRef } from "react";

interface SwaggerUIBundleFn {
  (config: Record<string, unknown>): unknown;
  presets: { apis: unknown };
}

declare global {
  interface Window {
    SwaggerUIBundle?: SwaggerUIBundleFn;
  }
}

const SWAGGER_UI_VERSION = "5.17.14";
const CSS_URL = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css`;
const BUNDLE_URL = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js`;

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      if (window.SwaggerUIBundle) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

function loadStylesheetOnce(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Renders the project's OpenAPI spec (public/openapi.yaml) via Swagger UI,
 * loaded from a CDN rather than bundled as an npm dependency — this is an
 * internal, admin-only documentation viewer, not app functionality, so it
 * doesn't need to ship in the main bundle.
 */
export function SwaggerUIEmbed({ specUrl }: { specUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadStylesheetOnce(CSS_URL);
    loadScriptOnce(BUNDLE_URL)
      .then(() => {
        if (cancelled || !containerRef.current || !window.SwaggerUIBundle) return;
        const SwaggerUIBundle = window.SwaggerUIBundle;
        SwaggerUIBundle({
          url: specUrl,
          domNode: containerRef.current,
          presets: [SwaggerUIBundle.presets.apis],
          deepLinking: true,
        });
      })
      .catch((err) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.textContent = `Failed to load API documentation: ${String(err)}`;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [specUrl]);

  return <div ref={containerRef} className="swagger-ui-container rounded-xl bg-white" />;
}
