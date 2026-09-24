"use client";

import { useActionState } from "react";
import { regenerateReferralCodeAction } from "./actions";

export default function RegenerateCodeForm() {
  const [state, formAction, pending] = useActionState(regenerateReferralCodeAction, undefined);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Regenerating your referral code will make your current code inactive for new registrations. Existing referral relationships you already have will not be affected. Continue?")) {
          e.preventDefault();
        }
      }}
      className="mt-3 flex flex-col gap-2"
    >
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch w-fit items-center justify-center rounded-lg bg-surface-container px-3 text-xs font-semibold text-on-surface shadow-sm transition-all hover:bg-surface-container-high disabled:opacity-50"
      >
        {pending ? "Regenerating..." : "Regenerate / rotate referral code"}
      </button>
      {state?.error ? <p className="text-xs text-error">{state.error}</p> : null}
      {state?.message ? <p className="text-xs text-secondary">{state.message}</p> : null}
    </form>
  );
}
