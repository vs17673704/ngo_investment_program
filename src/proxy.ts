import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const PROTECTED_USER_PREFIX = "/dashboard";
const PROTECTED_ADMIN_PREFIX = "/admin";

// API documentation is gated by its own HTTP Basic Auth credentials,
// deliberately separate from the platform's User/Admin accounts — it's
// developer-facing reference material, not an in-app feature. Sample
// credentials are documented in README.md; override them via env vars for
// any shared/deployed environment.
const DOCS_PATHS = new Set(["/api-docs", "/openapi.yaml"]);

function requireDocsAuth(request: NextRequest): NextResponse | null {
  const expectedUser = process.env.API_DOCS_USERNAME ?? "api-docs";
  const expectedPass = process.env.API_DOCS_PASSWORD ?? "ChangeMe123!";

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice("Basic ".length));
      const separatorIndex = decoded.indexOf(":");
      const user = decoded.slice(0, separatorIndex);
      const pass = decoded.slice(separatorIndex + 1);
      if (user === expectedUser && pass === expectedPass) return null;
    } catch {
      // fall through to 401 below
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="API Docs"' },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (DOCS_PATHS.has(pathname)) {
    const unauthorized = requireDocsAuth(request);
    return unauthorized ?? NextResponse.next();
  }

  const needsAuth =
    pathname.startsWith(PROTECTED_USER_PREFIX) || pathname.startsWith(PROTECTED_ADMIN_PREFIX);

  if (!needsAuth) return NextResponse.next();

  const token = request.cookies.get("session_token")?.value;
  const payload = token ? await verifyAccessToken(token) : null;

  if (!payload) {
    const landingUrl = new URL("/", request.url);
    return NextResponse.redirect(landingUrl);
  }

  if (pathname.startsWith(PROTECTED_ADMIN_PREFIX) && payload.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api-docs", "/openapi.yaml"],
};
