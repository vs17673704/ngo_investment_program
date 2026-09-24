"use client";

import { useActionState } from "react";
import { changePaymentMethodAction, type ChangePaymentMethodState } from "./actions";

const METHODS = [
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "NETBANKING", label: "Net Banking" },
  { value: "WALLET", label: "Wallet" },
];

export default function ChangePaymentMethodForm({
  userPlanId,
  currentMethod,
}: {
  userPlanId: string;
  currentMethod: string;
}) {
  const [state, formAction, pending] = useActionState<ChangePaymentMethodState, FormData>(
    changePaymentMethodAction.bind(null, userPlanId),
    undefined,
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <select
        name="method"
        defaultValue={currentMethod}
        className="min-h-touch rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-sm text-on-surface"
      >
        {METHODS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch items-center justify-center rounded-lg bg-surface-container px-3 text-sm font-medium text-primary transition-colors hover:bg-surface-container-high disabled:opacity-50"
      >
        {pending ? "Saving..." : "Change payment method"}
      </button>
      {state?.error && <p className="text-xs text-error">{state.error}</p>}
      {state?.success && <p className="text-xs text-secondary">Updated</p>}
    </form>
  );
}
