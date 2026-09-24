import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";

const PROTECTED_USER_PREFIX = "/dashboard";
const PROTECTED_ADMIN_PREFIX = "/admin";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
