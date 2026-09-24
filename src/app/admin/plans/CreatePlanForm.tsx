"use client";

import { useActionState, useEffect, useRef } from "react";
import { createPlanAction, type PlanFormState } from "./actions";

const inputClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";
const labelClass = "block text-sm font-medium text-on-surface";

export default function CreatePlanForm({
  interestMethods,
  onSuccess,
}: {
  interestMethods: { id: string; name: string }[];
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState<PlanFormState, FormData>(
    createPlanAction,
    undefined,
  );

  // The action returns undefined on both the initial render and a
  // successful submit, so a completed submit with no error is detected by
  // watching pending's true -> false transition rather than the state value
  // itself.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) onSuccess?.();
    wasPending.current = pending;
  }, [pending, state, onSuccess]);

  return (
    <form action={formAction} className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="name" className={labelClass}>
          Plan name
        </label>
        <input id="name" name="name" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="tenureMonths" className={labelClass}>
          Tenure (months)
        </label>
        <input id="tenureMonths" name="tenureMonths" type="number" min="1" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="paymentFrequency" className={labelClass}>
          Payment frequency
        </label>
        <select id="paymentFrequency" name="paymentFrequency" required className={inputClass}>
          <option value="MONTHLY">Monthly</option>
          <option value="LUMPSUM">Lumpsum</option>
        </select>
      </div>
      <div>
        <label htmlFor="presetAmounts" className={labelClass}>
          Preset amounts (comma separated)
        </label>
        <input id="presetAmounts" name="presetAmounts" placeholder="1000, 2000, 5000" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="interestMethodId" className={labelClass}>
          Interest calculation method
        </label>
        <select id="interestMethodId" name="interestMethodId" required className={inputClass}>
          {interestMethods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rewardPercent" className={labelClass}>
          Reward % (optional)
        </label>
        <input
          id="rewardPercent"
          name="rewardPercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="commissionPercent" className={labelClass}>
          Referral commission %
        </label>
        <input
          id="commissionPercent"
          name="commissionPercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          required
          className={inputClass}
        />
      </div>
      {state?.error && <p className="text-sm text-error sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          Create plan
        </button>
      </div>
    </form>
  );
}
