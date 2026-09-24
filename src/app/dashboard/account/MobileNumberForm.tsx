"use client";

import { useActionState } from "react";
import { updateMobileNumberAction } from "./actions";
import { Icon } from "@/components/Icon";

export default function MobileNumberForm({ currentValue }: { currentValue: string | null }) {
  const [state, formAction, pending] = useActionState(updateMobileNumberAction, undefined);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-on-surface">Mobile number</span>
        <div className="relative flex items-center">
          <Icon name="call" className="pointer-events-none absolute left-3 text-[20px] text-on-surface-variant" />
          <input
            type="tel"
            name="mobileNumber"
            defaultValue={currentValue ?? ""}
            placeholder="e.g. +919876543210"
            className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-3 pl-10 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>
        <span className="text-xs text-on-surface-variant">
          Not used for login, 2FA, or password reset — leave blank to remove
        </span>
      </label>
      {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
      {state?.message ? <p className="text-sm text-secondary">{state.message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch w-fit items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save mobile number"}
      </button>
    </form>
  );
}
