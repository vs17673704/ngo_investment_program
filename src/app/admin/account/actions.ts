"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, destroySession, destroyRefreshTokenCookie } from "@/lib/auth/session";
import { revokeAllUserRefreshTokens } from "@/lib/auth/refresh-token";
import { hashPassword, verifyPassword, PASSWORD_POLICY_REGEX } from "@/lib/auth/password";
import { logAudit } from "@/lib/audit";
import { setPushNotificationsEnabled } from "@/lib/push/preferences";

export type ActionState = { error?: string; message?: string } | undefined;

// BRD Rule XLII: mirrors src/app/dashboard/account/actions.ts's
// updatePushNotificationsAction — same shared helper, admin's own account.
export async function updatePushNotificationsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const enabled = formData.get("pushNotificationsEnabled") === "on";
  await setPushNotificationsEnabled(session.sub, enabled);
  return { message: enabled ? "Push notifications enabled" : "Push notifications disabled" };
}

// Mirrors src/app/dashboard/account/actions.ts's updateMobileNumberAction —
// same contact-info field on the shared User model, admin's own account.
const mobileNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, "Enter a valid mobile number (7-15 digits, optional leading +)");

export async function updateMobileNumberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const raw = String(formData.get("mobileNumber") ?? "").trim();

  if (raw === "") {
    await prisma.user.update({ where: { id: session.sub }, data: { mobileNumber: null } });
    await logAudit({ actorUserId: session.sub, eventType: "MOBILE_NUMBER_UPDATED", entityRef: session.sub });
    revalidatePath("/admin/account");
    return { message: "Mobile number removed" };
  }

  const parsed = mobileNumberSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid mobile number" };
  }

  await prisma.user.update({ where: { id: session.sub }, data: { mobileNumber: parsed.data } });
  await logAudit({ actorUserId: session.sub, eventType: "MOBILE_NUMBER_UPDATED", entityRef: session.sub });
  revalidatePath("/admin/account");
  return { message: "Mobile number updated" };
}

// Mirrors src/app/dashboard/account/actions.ts's changePasswordAction.
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .regex(PASSWORD_POLICY_REGEX, "Password must be 8+ characters and include upper, lower, digit, and special character"),
});

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.sub } });
  if (!user.passwordHash) {
    return { error: "This account has no password set (signed in via Google). Set one is not supported yet." };
  }

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return { error: "Current password is incorrect" };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  await logAudit({ actorUserId: user.id, eventType: "PASSWORD_CHANGED", entityRef: user.id });

  await revokeAllUserRefreshTokens(user.id);
  await destroySession();
  await destroyRefreshTokenCookie();
  redirect("/login");
}
