"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  getPendingTwoFactorSession,
  destroyPendingTwoFactorSession,
  createSession,
  createRefreshTokenCookie,
} from "@/lib/auth/session";
import { issueRefreshToken } from "@/lib/auth/refresh-token";
import { verifyOtp, createOtp } from "@/lib/auth/otp";
import { logAudit } from "@/lib/audit";

export type ActionState = { error?: string; message?: string } | undefined;

export async function verifyTwoFactorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const pending = await getPendingTwoFactorSession();
  if (!pending) {
    redirect("/login");
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!code) {
    return { error: "Enter the verification code" };
  }

  const user = await prisma.user.findUnique({ where: { id: pending.sub } });
  if (!user) {
    await destroyPendingTwoFactorSession();
    redirect("/login");
  }

  const result = await verifyOtp(user.id, "LOGIN_2FA", code);
  if (!result.ok) {
    return { error: result.error };
  }

  const headerList = await headers();
  const loginHistory = await prisma.loginHistory.create({
    data: {
      userId: user.id,
      ipAddress: headerList.get("x-forwarded-for") ?? undefined,
      userAgent: headerList.get("user-agent") ?? undefined,
    },
  });
  await logAudit({ actorUserId: user.id, eventType: "LOGIN_SUCCESS", entityRef: user.id });

  const { remembered } = pending;
  await destroyPendingTwoFactorSession();
  await createSession({ sub: user.id, role: user.role, sessionId: loginHistory.id }, { remembered });

  const rawRefreshToken = await issueRefreshToken(user.id, remembered);
  await createRefreshTokenCookie(rawRefreshToken, { remembered });

  // "replace" swaps out the /verify-2fa history entry (which itself replaced
  // /login in loginAction) so the browser Back button can no longer return
  // to either the login form or the OTP screen once 2FA succeeds.
  redirect(user.role === "ADMIN" ? "/admin" : "/dashboard", "replace");
}

export async function resendTwoFactorOtpAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const pending = await getPendingTwoFactorSession();
  if (!pending) {
    redirect("/login");
  }

  try {
    await createOtp(pending.sub, "LOGIN_2FA");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not resend code" };
  }

  return { message: "A new code has been sent." };
}
