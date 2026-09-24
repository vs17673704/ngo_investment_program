"use client";

import { useActionState } from "react";
import { cancelReferralAction, type CancelReferralState } from "./actions";

export function CancelReferralForm({ referralId }: { referralId: string }) {
  const action = cancelReferralAction.bind(null, referralId);
  const [state, formAction, pending] = useActionState<CancelReferralState, FormData>(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        name="reason"
        placeholder="Cancellation reason"
        required
        className="min-h-touch min-w-[180px] flex-1 rounded-lg border border-outline-variant bg-surface-container-low px-2 text-xs text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch items-center justify-center rounded-lg border border-error px-2 text-xs font-medium text-error transition-colors hover:bg-error-container/30 disabled:opacity-50"
      >
        {pending ? "Cancelling..." : "Cancel referral"}
      </button>
      {state?.error && <p className="w-full text-xs text-error">{state.error}</p>}
    </form>
  );
}
