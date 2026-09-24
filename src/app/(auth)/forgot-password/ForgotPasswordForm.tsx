"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "./actions";
import { Icon } from "@/components/Icon";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, undefined);

  return (
    <>
      <div className="mb-6 space-y-1">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-on-surface">Forgot password</h2>
        <p className="text-sm text-on-surface-variant">
          Enter your email and we&apos;ll send you a reset code.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-on-surface">Email</span>
          <div className="relative flex items-center">
            <Icon name="mail" className="pointer-events-none absolute left-3 text-[20px] text-on-surface-variant" />
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="name@example.com"
              className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-3 pl-10 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
        </label>
        {state?.message ? <p className="text-sm text-on-surface-variant">{state.message}</p> : null}
        {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          {pending ? "Sending..." : "Send reset code"}
        </button>
      </form>

      {state?.message ? (
        <p className="mt-4 text-sm text-on-surface-variant">
          <Link href="/reset-password" className="font-semibold text-on-surface hover:underline">
            Have a code? Reset your password
          </Link>
        </p>
      ) : null}
      <p className="mt-4 text-sm text-on-surface-variant">
        <Link href="/login" className="font-semibold text-on-surface hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
