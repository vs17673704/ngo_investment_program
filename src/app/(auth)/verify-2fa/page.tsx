import { redirect } from "next/navigation";
import { getPendingTwoFactorSession } from "@/lib/auth/session";
import VerifyOtpForm from "./VerifyOtpForm";
import { AuthShell } from "@/components/AuthShell";

export default async function VerifyTwoFactorPage() {
  const pending = await getPendingTwoFactorSession();
  if (!pending) {
    redirect("/login");
  }

  return (
    <AuthShell>
      <div className="mb-6 space-y-1">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-on-surface">Verify your identity</h2>
        <p className="text-sm text-on-surface-variant">
          We sent a 6-digit verification code to your email. Enter it below to continue.
        </p>
      </div>
      <VerifyOtpForm />
    </AuthShell>
  );
}
