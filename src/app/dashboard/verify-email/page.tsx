import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getUserDashboardData } from "@/lib/dashboard";
import VerifyEmailForm from "./VerifyEmailForm";

export default async function VerifyEmailPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await getUserDashboardData(session.sub);
  if (data.user.isEmailVerified) redirect("/dashboard");

  return (
    <>
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6 rounded-xl bg-surface-container-lowest p-6 shadow-sm">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Verify your email</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Send a verification code to {data.user.email} and enter it below.
          </p>
        </div>
        <VerifyEmailForm />
      </div>
    </>
  );
}
