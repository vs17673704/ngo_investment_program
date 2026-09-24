"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "../actions";
import { Icon } from "@/components/Icon";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <>
      <div className="mb-6 space-y-1">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-on-surface">Sign in to your account</h2>
        <p className="text-sm text-on-surface-variant">
          Enter your registered email and password to access your dashboard.
        </p>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-lg bg-surface-container p-3">
        <Icon name="verified_user" className="mt-0.5 shrink-0 text-[20px] text-secondary" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-on-surface">Two-Factor Authentication Enforced</span>
          <p className="text-sm text-on-surface-variant">
            Upon credential verification, a single-use OTP will be sent to your email.
          </p>
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center justify-between font-medium text-on-surface">
            Email address <span className="text-xs font-normal text-on-surface-variant">Required</span>
          </span>
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
          <span className="flex items-center justify-between font-medium text-on-surface">
            Password <span className="text-xs font-normal text-on-surface-variant">Required</span>
          </span>
          <div className="relative flex items-center">
            <Icon name="lock" className="pointer-events-none absolute left-3 text-[20px] text-on-surface-variant" />
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-3 pl-10 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
        </label>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-on-surface-variant">
            <input
              type="checkbox"
              name="remember"
              className="size-4 rounded border-surface-container-high text-primary focus:ring-2 focus:ring-primary"
            />
            Remember me
          </label>
          <Link href="/forgot-password" className="text-sm font-semibold text-on-surface hover:underline">
            Forgot password?
          </Link>
        </div>
        {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          {pending ? "Logging in..." : "Log in"}
          <Icon name="arrow_forward" className="text-[20px]" />
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="h-px w-full bg-surface-container-high" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-surface-container-lowest px-3 text-xs tracking-wider text-on-surface-variant uppercase">
            or continue with
          </span>
        </div>
      </div>

      <Link
        href="/login/social/google"
        className="flex min-h-touch w-full items-center justify-center gap-3 rounded-xl bg-surface-container-low text-sm font-medium text-on-surface shadow-sm transition-all hover:bg-surface-container"
      >
        Continue with Google
      </Link>

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-2 text-sm text-on-surface-variant">
        <Icon name="report" className="shrink-0 text-[16px] text-error" />
        <span>5 consecutive failed attempts trigger a temporary lockout.</span>
      </div>

      <div className="mt-6 flex items-center justify-center gap-1 pt-4 text-sm text-on-surface-variant">
        <span>Don&apos;t have an account?</span>
        <Link href="/register" className="font-semibold text-on-surface hover:underline">
          Register
        </Link>
      </div>
    </>
  );
}
