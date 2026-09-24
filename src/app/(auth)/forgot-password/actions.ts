"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOtp } from "@/lib/auth/otp";

export type ActionState = { message?: string; error?: string } | undefined;

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

const GENERIC_MESSAGE =
  "If an account exists for this email, a password reset code has been sent.";

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data } });
  // Avoid user enumeration: always show the same message regardless of whether
  // the account exists, but only actually send an OTP when it does.
  if (user) {
    await createOtp(user.id, "PASSWORD_RESET").catch(() => {
      // Rate-limit errors also fall through to the generic message.
    });
  }

  return { message: GENERIC_MESSAGE };
}
