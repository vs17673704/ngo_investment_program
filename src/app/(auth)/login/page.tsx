import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { getSession } from "@/lib/auth/session";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  // Belt-and-suspenders: if the browser still lands here with a valid
  // session (e.g. a cached/back-forward-restored copy of this page), send
  // the user straight back to their dashboard instead of showing the login
  // form again. The history itself is also cleared on the way in — see the
  // "replace" redirects in ../actions.ts and verify-2fa/actions.ts.
  const session = await getSession();
  if (session) {
    redirect(session.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
