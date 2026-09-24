import { Suspense } from "react";
import { AuthShell } from "@/components/AuthShell";
import GoogleSocialLoginForm from "./GoogleSocialLoginForm";

// Simulated Google OAuth consent screen (Master Prompt: simulate external
// integrations rather than wiring a real provider). The email entered here
// models the verified email address a real Google OAuth flow would return.
export default function GoogleSocialLoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <GoogleSocialLoginForm />
      </Suspense>
    </AuthShell>
  );
}
