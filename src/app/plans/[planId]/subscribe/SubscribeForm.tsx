"use client";

import { useActionState } from "react";
import { subscribeToPlanAction, type SubscribeState } from "../actions";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";
import { cadenceKey, formatCadence, type Cadence } from "@/lib/range-generator";

const selectClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";
const labelClass = "block text-sm font-semibold text-primary";

// BRD Rule XLIX: the amount and duration lists are shown as independent
// native <select> dropdowns, not tiles — both continue to drive AutoPay per
// BRD Rule XIV.
export function SubscribeForm({
  planId,
  amounts,
  cadences,
}: {
  planId: string;
  amounts: number[];
  cadences: Cadence[];
}) {
  const boundAction = subscribeToPlanAction.bind(null, planId);
  const [state, formAction, pending] = useActionState<SubscribeState, FormData>(
    boundAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div>
        <label htmlFor="amount" className={labelClass}>
          Choose an instalment amount
        </label>
        <select id="amount" name="amount" required defaultValue={amounts[0] ?? ""} className={selectClass}>
          {amounts.map((amount) => (
            <option key={amount} value={amount}>
              {formatINR(amount)}
            </option>
          ))}
        </select>
      </div>

      {cadences.length > 0 && (
        <div>
          <label htmlFor="duration" className={labelClass}>
            Choose a payment duration
          </label>
          <select
            id="duration"
            name="duration"
            required
            defaultValue={cadenceKey(cadences[0])}
            className={selectClass}
          >
            {cadences.map((c) => (
              <option key={cadenceKey(c)} value={cadenceKey(c)}>
                {formatCadence(c)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-1 text-[11px] text-on-surface-variant">
        <Icon name="lock" className="text-[13px] text-outline" />
        Amount and duration are selected from verified plan configuration only.
      </div>

      {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-on-primary shadow-md transition-all hover:bg-primary-container active:scale-[0.99] disabled:opacity-60"
      >
        <Icon name="lock" className="text-[20px]" />
        {pending ? "Setting up AutoPay..." : "Confirm & Set Up AutoPay"}
        {!pending && <Icon name="arrow_forward" className="text-[18px]" />}
      </button>
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-on-surface-variant">
        <Icon name="verified_user" className="text-[14px] text-secondary" />
        Bank-grade simulated security with automated callback verification.
      </div>
    </form>
  );
}
