"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/session";
import { createOtp, verifyOtp } from "@/lib/auth/otp";
import { logAudit } from "@/lib/audit";

export type ActionState = { error?: string; message?: string } | undefined;

export async function requestEmailVerificationAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");

  try {
    await createOtp(session.sub, "EMAIL_VERIFY");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send verification code" };
  }

  return { message: "A verification code has been sent to your email." };
}

export async function verifyEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the verification code" };

  const result = await verifyOtp(session.sub, "EMAIL_VERIFY", code);
  if (!result.ok) return { error: result.error };

  await prisma.user.update({ where: { id: session.sub }, data: { isEmailVerified: true } });
  await logAudit({ actorUserId: session.sub, eventType: "EMAIL_VERIFIED", entityRef: session.sub });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
