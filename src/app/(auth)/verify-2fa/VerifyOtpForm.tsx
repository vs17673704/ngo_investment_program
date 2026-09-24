"use client";

import { useActionState } from "react";
import { verifyTwoFactorAction, resendTwoFactorOtpAction } from "./actions";
import { Icon } from "@/components/Icon";

export default function VerifyOtpForm() {
  const [state, formAction, pending] = useActionState(verifyTwoFactorAction, undefined);
  const [resendState, resendAction, resendPending] = useActionState(resendTwoFactorOtpAction, undefined);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-on-surface">Verification code</span>
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
        {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          {pending ? "Verifying..." : "Verify"}
          <Icon name="arrow_forward" className="text-[20px]" />
        </button>
      </form>
      <form action={resendAction} className="flex flex-col gap-1">
        {resendState?.message ? <p className="text-sm text-on-surface-variant">{resendState.message}</p> : null}
        {resendState?.error ? <p className="text-sm text-error">{resendState.error}</p> : null}
        <button
          type="submit"
          disabled={resendPending}
          className="text-sm font-semibold text-on-surface hover:underline disabled:opacity-50"
        >
          {resendPending ? "Sending..." : "Resend code"}
        </button>
      </form>
    </div>
  );
}
