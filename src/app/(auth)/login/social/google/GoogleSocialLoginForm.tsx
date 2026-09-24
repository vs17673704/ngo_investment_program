"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { socialLoginAction } from "./actions";
import { Icon } from "@/components/Icon";

export default function GoogleSocialLoginForm() {
  const searchParams = useSearchParams();
  const refFromLink = searchParams.get("ref") ?? "";
  const [state, formAction, pending] = useActionState(socialLoginAction, undefined);

  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <svg className="h-10 w-10" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            fill="#EA4335"
          />
        </svg>
        <h2 className="font-heading text-2xl font-bold tracking-tight text-on-surface">Sign in with Google</h2>
        <p className="text-sm text-on-surface-variant">
          Simulated consent screen — enter the email your Google account would provide.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-on-surface">Google account email</span>
          <div className="relative flex items-center">
            <Icon name="mail" className="pointer-events-none absolute left-3 text-[20px] text-on-surface-variant" />
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="name@gmail.com"
              className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-3 pl-10 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
        </label>
        <input type="hidden" name="referralCode" value={refFromLink} />
        {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          {pending ? "Authorizing..." : "Authorize"}
        </button>
        <Link href="/login" className="text-center text-sm font-semibold text-on-surface hover:underline">
          Cancel
        </Link>
      </form>
    </>
  );
}
