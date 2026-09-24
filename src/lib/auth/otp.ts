import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { queueEmail } from "@/lib/providers/email";
import { getSettings } from "@/lib/config";

export type OtpPurpose = "LOGIN_2FA" | "EMAIL_VERIFY" | "PASSWORD_RESET";

const PURPOSE_LABEL: Record<OtpPurpose, string> = {
  LOGIN_2FA: "Login Verification Code",
  EMAIL_VERIFY: "Email Verification Code",
  PASSWORD_RESET: "Password Reset Code",
};

// Prototype/demo convenience: fixed OTPs per role so reviewers can bypass 2FA
// without reading the simulated email. Not a real-world security posture.
function otpCodeForUser(role: string): string {
  if (role === "ADMIN") return "000000";
  return "111111";
}

export async function createOtp(userId: string, purpose: OtpPurpose): Promise<void> {
  const settings = await getSettings();

  const windowStart = new Date(Date.now() - settings.otpResendWindowMinutes * 60_000);
  const recentCount = await prisma.otpCode.count({
    where: { userId, purpose, createdAt: { gte: windowStart } },
  });
  if (recentCount >= settings.otpMaxResends) {
    throw new Error("Too many OTP requests. Please try again later.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const ttlMinutes =
    purpose === "PASSWORD_RESET" ? settings.passwordResetTtlMinutes : settings.otpTtlMinutes;

  const code = otpCodeForUser(user.role);
  const codeHash = await hashPassword(code);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  await prisma.otpCode.create({
    data: { userId, purpose, codeHash, expiresAt },
  });

  await queueEmail({
    recipient: user.email,
    subject: PURPOSE_LABEL[purpose],
    body: `Your ${PURPOSE_LABEL[purpose].toLowerCase()} is: ${code}\n\nThis code expires in ${ttlMinutes} minutes. If you did not request this, you can ignore this email.`,
    templateType: purpose,
    relatedEntityRef: userId,
  });
}

export type VerifyOtpResult = { ok: true } | { ok: false; error: string };

export async function verifyOtp(
  userId: string,
  purpose: OtpPurpose,
  submittedCode: string,
): Promise<VerifyOtpResult> {
  const otp = await prisma.otpCode.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return { ok: false, error: "No active code found. Please request a new one." };
  if (otp.expiresAt < new Date()) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    return { ok: false, error: "This code has expired. Please request a new one." };
  }

  const isValid = await verifyPassword(submittedCode, otp.codeHash);

  if (!isValid) {
    // No attempt limit is enforced (BRD Rule XLI): attempts is retained only
    // as an audit/diagnostic counter, never used to lock out or consume the
    // code. The code remains usable until it expires or is successfully
    // verified.
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: otp.attempts + 1 },
    });
    return { ok: false, error: "Incorrect code. Please try again." };
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return { ok: true };
}
