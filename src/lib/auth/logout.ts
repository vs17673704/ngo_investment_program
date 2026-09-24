import { prisma } from "@/lib/prisma";
import { getSession, destroySession, destroyRefreshTokenCookie, getRefreshTokenCookie } from "./session";
import { revokeRefreshToken } from "./refresh-token";
import { logAudit } from "@/lib/audit";

// Used by the logout Server Action (logoutAction) for a normal
// user-initiated logout.
export async function performServerLogout() {
  const session = await getSession();
  if (session) {
    await prisma.loginHistory
      .update({
        where: { id: session.sessionId },
        data: { logoutAt: new Date() },
      })
      .catch(() => {});

    const rawRefreshToken = await getRefreshTokenCookie();
    if (rawRefreshToken) {
      await revokeRefreshToken(rawRefreshToken);
    }

    await logAudit({ actorUserId: session.sub, eventType: "LOGOUT", entityRef: session.sub });
  }

  await destroySession();
  await destroyRefreshTokenCookie();
}
