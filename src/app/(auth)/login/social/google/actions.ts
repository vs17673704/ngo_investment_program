"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/referral-code";
import { getSettings } from "@/lib/config";
import { queueEmail } from "@/lib/providers/email";
import { createNotification } from "@/lib/providers/notification";
import { logAudit } from "@/lib/audit";
import { createPendingTwoFactorSession } from "@/lib/auth/session";
import { createOtp } from "@/lib/auth/otp";

export type ActionState = { error?: string } | undefined;

const PROVIDER = "GOOGLE";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export async function socialLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }
  const email = parsed.data;
  const referralCode = String(formData.get("referralCode") ?? "").trim().toUpperCase() || undefined;

  const providerAccountId = `${PROVIDER.toLowerCase()}:${email}`;

  let user = await prisma.socialAccount
    .findUnique({
      where: { provider_providerAccountId: { provider: PROVIDER, providerAccountId } },
      include: { user: true },
    })
    .then((sa) => sa?.user ?? null);

  if (!user) {
    const existingByEmail = await prisma.user.findUnique({ where: { email } });

    if (existingByEmail) {
      // BRD: link to an existing account by email rather than creating a duplicate.
      user = existingByEmail;
      await prisma.socialAccount.create({
        data: { userId: user.id, provider: PROVIDER, providerAccountId },
      });
      if (!user.isEmailVerified) {
        user = await prisma.user.update({ where: { id: user.id }, data: { isEmailVerified: true } });
      }
      await logAudit({ actorUserId: user.id, eventType: "SOCIAL_ACCOUNT_LINKED", entityRef: user.id });
    } else {
      let referrer = null;
      if (referralCode) {
        referrer = await prisma.user.findUnique({ where: { referralCode } });
        if (!referrer || !referrer.referralCodeActive) {
          return { error: "Referral code is invalid or inactive" };
        }
      }

      const newReferralCode = await generateUniqueReferralCode();
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: null,
          referralCode: newReferralCode,
          role: "USER",
          isEmailVerified: true,
        },
      });

      await prisma.socialAccount.create({
        data: { userId: user.id, provider: PROVIDER, providerAccountId },
      });

      if (referrer) {
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
        body: `Your account has been created via Google sign-in. Your referral code is ${user.referralCode}.`,
        templateType: "REGISTRATION",
        relatedEntityRef: user.id,
      });

      await createNotification({
        userId: user.id,
        type: "REGISTRATION",
        title: "Welcome!",
        message: "Your account has been created successfully.",
      });

      await logAudit({ actorUserId: user.id, eventType: "SOCIAL_ACCOUNT_CREATED", entityRef: user.id });
    }
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Account temporarily locked due to too many failed attempts. Try again later." };
  }

  // Social login does not bypass 2FA — same pending-session + OTP gate as
  // password login. No "remember me" option on this flow, so default false.
  await createPendingTwoFactorSession(user.id, false);

  try {
    await createOtp(user.id, "LOGIN_2FA");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send verification code" };
  }

  await logAudit({ actorUserId: user.id, eventType: "LOGIN_2FA_INITIATED", entityRef: user.id });
  // "replace" so Back can't return to the login/social screen post-login —
  // matches the password-login flow in ../../actions.ts.
  redirect("/verify-2fa", "replace");
}
