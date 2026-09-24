import { cookies } from "next/headers";
import {
  signAccessToken,
  verifyAccessToken,
  signPendingTwoFactorToken,
  verifyPendingTwoFactorToken,
  REMEMBERED_ACCESS_TOKEN_TTL_DAYS,
  type AccessTokenPayload,
  type PendingTwoFactorPayload,
} from "./jwt";

const COOKIE_NAME = "session_token";
const ACCESS_TOKEN_TTL_MIN = Number(process.env.JWT_ACCESS_TOKEN_TTL_MIN ?? 30);

const PENDING_2FA_COOKIE_NAME = "pending_2fa_token";
const PENDING_2FA_TTL_MIN = 10;

const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_TOKEN_TTL_DAYS = 30;
const REMEMBERED_REFRESH_TOKEN_TTL_DAYS = REMEMBERED_ACCESS_TOKEN_TTL_DAYS;

export async function createSession(payload: AccessTokenPayload, options?: { remembered?: boolean }) {
  const remembered = options?.remembered ?? false;
  const token = await signAccessToken(payload, { remembered });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: remembered ? REMEMBERED_ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 : ACCESS_TOKEN_TTL_MIN * 60,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<AccessTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function createRefreshTokenCookie(rawToken: string, options?: { remembered?: boolean }) {
  const remembered = options?.remembered ?? false;
  const cookieStore = await cookies();
  cookieStore.set(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: (remembered ? REMEMBERED_REFRESH_TOKEN_TTL_DAYS : REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60,
  });
}

export async function destroyRefreshTokenCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(REFRESH_COOKIE_NAME);
}

export async function getRefreshTokenCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_COOKIE_NAME)?.value ?? null;
}

export async function createPendingTwoFactorSession(userId: string, remembered: boolean) {
  const token = await signPendingTwoFactorToken({ sub: userId, remembered });
  const cookieStore = await cookies();
  cookieStore.set(PENDING_2FA_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_2FA_TTL_MIN * 60,
  });
}

export async function destroyPendingTwoFactorSession() {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_2FA_COOKIE_NAME);
}

export async function getPendingTwoFactorSession(): Promise<PendingTwoFactorPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_2FA_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyPendingTwoFactorToken(token);
}
