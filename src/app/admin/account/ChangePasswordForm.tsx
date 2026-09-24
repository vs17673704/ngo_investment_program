"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";
import { Icon } from "@/components/Icon";

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, undefined);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-on-surface">Current password</span>
        <div className="relative flex items-center">
          <Icon name="lock" className="pointer-events-none absolute left-3 text-[20px] text-on-surface-variant" />
          <input
            type="password"
            name="currentPassword"
            required
            autoComplete="current-password"
            className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-3 pl-10 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-on-surface">New password</span>
        <div className="relative flex items-center">
          <Icon name="lock_reset" className="pointer-events-none absolute left-3 text-[20px] text-on-surface-variant" />
          <input
            type="password"
            name="newPassword"
            required
            autoComplete="new-password"
            className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-3 pl-10 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>
        <span className="text-xs text-on-surface-variant">
          8+ characters, with upper, lower, digit &amp; special character
        </span>
      </label>
      {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
      {state?.message ? <p className="text-sm text-secondary">{state.message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch w-fit items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
      >
        {pending ? "Updating..." : "Change password"}
      </button>
    </form>
  );
}
