"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "./actions";
import { Icon } from "@/components/Icon";

export default function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, undefined);

  return (
    <>
      <div className="mb-6 space-y-1">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-on-surface">Reset password</h2>
        <p className="text-sm text-on-surface-variant">
          Enter the code we emailed you along with your new password.
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-on-surface">Reset code</span>
          <div className="relative flex items-center">
            <Icon name="pin" className="pointer-events-none absolute left-3 text-[20px] text-on-surface-variant" />
            <input
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              placeholder="123456"
              className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-3 pl-10 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-on-surface">New password</span>
          <div className="relative flex items-center">
            <Icon name="lock" className="pointer-events-none absolute left-3 text-[20px] text-on-surface-variant" />
            <input
              type="password"
              name="password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-3 pl-10 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
          <span className="text-xs text-on-surface-variant">
            8+ characters, with upper, lower, digit &amp; special character
          </span>
        </label>
        {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          {pending ? "Resetting..." : "Reset password"}
        </button>
      </form>

      <p className="mt-6 text-sm text-on-surface-variant">
        <Link href="/login" className="font-semibold text-on-surface hover:underline">
          Back to log in
        </Link>
      </p>
    </>
  );
}
