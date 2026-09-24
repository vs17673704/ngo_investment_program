"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { registerAction } from "../actions";
import { Icon } from "@/components/Icon";

export default function RegisterForm() {
  const searchParams = useSearchParams();
  const refFromLink = searchParams.get("ref") ?? "";
  const [state, formAction, pending] = useActionState(registerAction, undefined);

  return (
    <>
      <div className="mb-6 space-y-1">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-on-surface">Create your account</h2>
        <p className="text-sm text-on-surface-variant">
          Register to start investing, referring, and earning rewards.
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
          <span className="font-medium text-on-surface">Password</span>
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-on-surface">Referral code (optional)</span>
          <div className="relative flex items-center">
            <Icon
              name="redeem"
              className="pointer-events-none absolute left-3 text-[20px] text-on-surface-variant"
            />
            <input
              type="text"
              name="referralCode"
              defaultValue={refFromLink}
              maxLength={8}
              placeholder="ABCD1234"
              className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-3 pl-10 text-on-surface uppercase transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
        </label>
        {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          {pending ? "Creating account..." : "Register"}
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
        href={`/login/social/google${refFromLink ? `?ref=${encodeURIComponent(refFromLink)}` : ""}`}
        className="flex min-h-touch w-full items-center justify-center gap-3 rounded-xl bg-surface-container-low text-sm font-medium text-on-surface shadow-sm transition-all hover:bg-surface-container"
      >
        Continue with Google
      </Link>

      <div className="mt-6 flex items-center justify-center gap-1 pt-4 text-sm text-on-surface-variant">
        <span>Already have an account?</span>
        <Link href="/login" className="font-semibold text-on-surface hover:underline">
          Log in
        </Link>
      </div>
    </>
  );
}
