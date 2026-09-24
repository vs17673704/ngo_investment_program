import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rotateRefreshToken } from "@/lib/auth/refresh-token";
import {
  createSession,
  createRefreshTokenCookie,
  destroySession,
  destroyRefreshTokenCookie,
  getRefreshTokenCookie,
} from "@/lib/auth/session";

// Client-driven refresh, polled by SessionKeepAlive. Kept out of proxy.ts
// (edge middleware) since rotation needs Prisma/DB access.
export async function POST() {
  const rawToken = await getRefreshTokenCookie();
  if (!rawToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  const result = await rotateRefreshToken(rawToken);
  if (!result) {
    await destroySession();
    await destroyRefreshTokenCookie();
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
  }

  const openSession = await prisma.loginHistory.findFirst({
    where: { userId: result.userId, logoutAt: null },
    orderBy: { loginAt: "desc" },
  });

  await createSession(
    {
      sub: result.userId,
      role: result.role,
      sessionId: openSession?.id ?? result.userId,
    },
    { remembered: result.remembered },
  );
  await createRefreshTokenCookie(result.raw, { remembered: result.remembered });

  return NextResponse.json({ ok: true });
}
