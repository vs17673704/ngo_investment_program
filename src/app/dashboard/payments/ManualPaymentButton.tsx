"use client";

import { useActionState } from "react";
import { submitManualPaymentAction, type ManualPaymentState } from "./actions";

export default function ManualPaymentButton({ paymentId }: { paymentId: string }) {
  const [state, formAction, pending] = useActionState<ManualPaymentState, FormData>(
    submitManualPaymentAction.bind(null, paymentId),
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
      >
        {pending ? "Paying..." : "Pay now"}
      </button>
      {state?.error && <p className="max-w-[200px] text-right text-xs text-error">{state.error}</p>}
    </form>
  );
}
