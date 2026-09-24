"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, createPendingTwoFactorSession, createRefreshTokenCookie } from "@/lib/auth/session";
import { performServerLogout } from "@/lib/auth/logout";
import { issueRefreshToken } from "@/lib/auth/refresh-token";
import { generateUniqueReferralCode } from "@/lib/referral-code";
import { registerSchema, loginSchema } from "@/lib/validation/auth";
import { getSettings } from "@/lib/config";
import { queueEmail } from "@/lib/providers/email";
import { createNotification } from "@/lib/providers/notification";
import { logAudit } from "@/lib/audit";
import { emitAdminEvent } from "@/lib/events/admin-events";
import { createOtp } from "@/lib/auth/otp";

export type ActionState = { error?: string } | undefined;

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    referralCode: formData.get("referralCode") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password, referralCode } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with this email already exists" };
  }

  let referrer = null;
  if (referralCode) {
    referrer = await prisma.user.findUnique({ where: { referralCode } });
    if (!referrer || !referrer.referralCodeActive) {
      return { error: "Referral code is invalid or inactive" };
    }
  }

  const passwordHash = await hashPassword(password);
  const newReferralCode = await generateUniqueReferralCode();

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      referralCode: newReferralCode,
      role: "USER",
    },
  });

  if (referrer) {
    // BRD: self-referral prevented (cannot happen here since account is new),
    // single-level only. Validity period fixed at relationship-creation time.
    const { referralValidityDays } = await getSettings();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + referralValidityDays);

    await prisma.referral.create({
      data: {
        referrerUserId: referrer.id,
        referredUserId: user.id,
        referralCodeUsed: referralCode!,
        expiryDate,
      },
    });
  }

  await queueEmail({
    recipient: user.email,
    subject: "Welcome — Registration Successful",
    body: `Your account has been created. Your referral code is ${user.referralCode}.`,
    templateType: "REGISTRATION",
    relatedEntityRef: user.id,
  });

  await createNotification({
    userId: user.id,
    type: "REGISTRATION",
    title: "Welcome!",
    message: "Your account has been created successfully.",
  });

  await logAudit({ actorUserId: user.id, eventType: "USER_REGISTERED", entityRef: user.id });

  try {
    await createOtp(user.id, "EMAIL_VERIFY");
  } catch {
    // Registration itself still succeeds; the user can resend the
    // verification code later from the verify-email screen.
  }

  const headerList = await headers();
  const loginHistory = await prisma.loginHistory.create({
    data: {
      userId: user.id,
      ipAddress: headerList.get("x-forwarded-for") ?? undefined,
      userAgent: headerList.get("user-agent") ?? undefined,
    },
  });

  await createSession({ sub: user.id, role: user.role, sessionId: loginHistory.id });

  const rawRefreshToken = await issueRefreshToken(user.id);
  await createRefreshTokenCookie(rawRefreshToken);

  // "replace" (not the Server Action default "push") swaps out the
  // /register history entry so the back button can't return to it post-login.
  redirect("/dashboard", "replace");
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return { error: "Invalid email or password" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Account temporarily locked due to too many failed attempts. Try again later." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failedCount = user.failedLoginCount + 1;
    const lockedUntil = failedCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failedCount, lockedUntil },
    });
    await logAudit({ actorUserId: user.id, eventType: "LOGIN_FAILED", entityRef: user.id });
    const headerList = await headers();
    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        result: "FAILED",
        ipAddress: headerList.get("x-forwarded-for") ?? undefined,
        userAgent: headerList.get("user-agent") ?? undefined,
      },
    });
    emitAdminEvent({
      type: "login.failed",
      message: `Failed login attempt for ${user.email}`,
      details: { userId: user.id, failedCount, locked: Boolean(lockedUntil) },
    });
    return { error: "Invalid email or password" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  const remember = formData.get("remember") === "on";

  await logAudit({ actorUserId: user.id, eventType: "LOGIN_2FA_INITIATED", entityRef: user.id });
  await createPendingTwoFactorSession(user.id, remember);

  try {
    await createOtp(user.id, "LOGIN_2FA");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send verification code" };
  }

  // "replace" swaps out the /login history entry with /verify-2fa, and
  // verifyTwoFactorAction below replaces that with the post-login dashboard —
  // so once login completes, Back can no longer step back through the login
  // or OTP screens.
  redirect("/verify-2fa", "replace");
}

export async function logoutAction() {
  await performServerLogout();

  // SiteNav (rendered by every public page under this root layout) reads
  // getSession() to decide Dashboard vs Login/Register. Without this, the
  // client Router Cache keeps serving the pre-logout RSC payload for "/"
  // (and other public pages), so the nav still shows "Dashboard" after
  // logout until a hard reload.
  revalidatePath("/", "layout");

  // "replace" (not the default push) drops the Dashboard history entry
  // instead of leaving it behind "/", so Back from the post-logout page
  // can no longer land on it at all — shrinks the window BfcacheGuard's
  // pageshow/popstate refresh has to cover, rather than only reacting
  // after a stale Dashboard snapshot is already restored.
  redirect("/", "replace");
}
