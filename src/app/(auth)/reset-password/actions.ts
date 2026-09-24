"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, PASSWORD_POLICY_REGEX } from "@/lib/auth/password";
import { verifyOtp } from "@/lib/auth/otp";
import { destroySession, destroyRefreshTokenCookie } from "@/lib/auth/session";
import { revokeAllUserRefreshTokens } from "@/lib/auth/refresh-token";
import { logAudit } from "@/lib/audit";

export type ActionState = { error?: string; message?: string } | undefined;

const resetSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  code: z.string().trim().min(1, "Enter the verification code"),
  password: z
    .string()
    .regex(PASSWORD_POLICY_REGEX, "Password must be 8+ characters and include upper, lower, digit, and special character"),
});

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, code, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Same generic failure as a wrong code — avoids confirming the email doesn't exist.
    return { error: "Invalid or expired code" };
  }

  const result = await verifyOtp(user.id, "PASSWORD_RESET", code);
  if (!result.ok) {
    return { error: result.error };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
  });

  await revokeAllUserRefreshTokens(user.id);
  await destroySession();
  await destroyRefreshTokenCookie();
  await logAudit({ actorUserId: user.id, eventType: "PASSWORD_RESET_SUCCESS", entityRef: user.id });

  redirect("/login");
}
