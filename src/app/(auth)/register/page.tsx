import { Suspense } from "react";
import { AuthShell } from "@/components/AuthShell";
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
