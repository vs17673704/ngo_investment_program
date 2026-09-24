"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createInterestMethodAction, type InterestMethodFormState } from "./actions";

const inputClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";
const labelClass = "block text-sm font-medium text-on-surface";

export default function CreateInterestMethodForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, formAction, pending] = useActionState<InterestMethodFormState, FormData>(
    createInterestMethodAction,
    undefined,
  );
  const [formulaType, setFormulaType] = useState<"SIMPLE" | "COMPOUND" | "CUSTOM">("SIMPLE");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      onSuccess?.();
    }
    wasPending.current = pending;
  }, [pending, state, onSuccess]);

  return (
    <form action={formAction} className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="name" className={labelClass}>
          Method name
        </label>
        <input id="name" name="name" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="formulaType" className={labelClass}>
          Formula type
        </label>
        <select
          id="formulaType"
          name="formulaType"
          required
          className={inputClass}
          value={formulaType}
          onChange={(e) => setFormulaType(e.target.value as typeof formulaType)}
        >
          <option value="SIMPLE">Simple Interest</option>
          <option value="COMPOUND">Compound Interest</option>
          <option value="CUSTOM">Custom Parameterized Formula</option>
        </select>
      </div>
      <div>
        <label htmlFor="ratePercent" className={labelClass}>
          Interest rate (% p.a.)
        </label>
        <input
          id="ratePercent"
          name="ratePercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="tenureMonths" className={labelClass}>
          Tenure basis (months)
        </label>
        <input id="tenureMonths" name="tenureMonths" type="number" min="1" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="dayCountBasis" className={labelClass}>
          Day count basis
        </label>
        <select id="dayCountBasis" name="dayCountBasis" required defaultValue="ACTUAL_365" className={inputClass}>
          <option value="ACTUAL_365">Actual/365</option>
          <option value="ACTUAL_360">Actual/360</option>
        </select>
      </div>
      {formulaType === "COMPOUND" && (
        <div>
          <label htmlFor="compoundingFrequency" className={labelClass}>
            Compounding frequency
          </label>
          <select id="compoundingFrequency" name="compoundingFrequency" required className={inputClass}>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="HALF_YEARLY">Half-yearly</option>
            <option value="ANNUALLY">Annually</option>
            <option value="DAILY">Daily</option>
          </select>
        </div>
      )}
      {formulaType === "CUSTOM" && (
        <div className="sm:col-span-2">
          <label htmlFor="customFormula" className={labelClass}>
            Custom formula
          </label>
          <input
            id="customFormula"
            name="customFormula"
            placeholder="Principal*(Rate/100)*Tenure"
            maxLength={100}
            required
            className={inputClass}
          />
          <p className="mt-1 text-xs text-on-surface-variant">
            Only Principal, Rate, Tenure, ElapsedDays and + - * / ( ) are allowed. Max 100 characters, max nesting
            depth 5.
          </p>
        </div>
      )}
      {state?.error && <p className="text-sm text-error sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          Create interest method
        </button>
      </div>
    </form>
  );
}
