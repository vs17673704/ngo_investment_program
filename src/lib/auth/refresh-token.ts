import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { emitAdminEvent } from "@/lib/events/admin-events";

const REFRESH_TOKEN_TTL_DAYS = 30;
// "Remember me": matches the access token's long-lived duration (jwt.ts).
const REMEMBERED_REFRESH_TOKEN_TTL_DAYS = 400;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function issueRefreshToken(userId: string, remembered = false): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const ttlDays = remembered ? REMEMBERED_REFRESH_TOKEN_TTL_DAYS : REFRESH_TOKEN_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt, remembered },
  });
  return raw;
}

export type RotateResult = { userId: string; role: "ADMIN" | "USER"; raw: string; remembered: boolean } | null;

// BRD Security Config: refresh tokens are single-use and rotated on refresh;
// reuse of an already-rotated/revoked token revokes the entire session.
export async function rotateRefreshToken(rawToken: string): Promise<RotateResult> {
  const tokenHash = hashToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing) return null;

  if (existing.revokedAt) {
    await revokeAllUserRefreshTokens(existing.userId);
    await logAudit({
      actorUserId: existing.userId,
      eventType: "TOKEN_REUSE_DETECTED",
      entityRef: existing.userId,
    });
    emitAdminEvent({
      type: "token.reuse_detected",
      message: "Revoked refresh token reuse detected — all sessions for this user were revoked",
      details: { userId: existing.userId },
    });
    return null;
  }

  if (existing.expiresAt < new Date()) return null;

  const newRaw = randomBytes(32).toString("hex");
  const newHash = hashToken(newRaw);
  const ttlDays = existing.remembered ? REMEMBERED_REFRESH_TOKEN_TTL_DAYS : REFRESH_TOKEN_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByTokenHash: newHash },
    }),
    prisma.refreshToken.create({
      data: { userId: existing.userId, tokenHash: newHash, expiresAt, remembered: existing.remembered },
    }),
  ]);

  await logAudit({
    actorUserId: existing.userId,
    eventType: "TOKEN_REFRESHED",
    entityRef: existing.userId,
  });

  return { userId: existing.userId, role: existing.user.role, raw: newRaw, remembered: existing.remembered };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
