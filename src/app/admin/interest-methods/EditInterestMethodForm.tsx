"use client";

import { useActionState, useState } from "react";
import { reviseInterestMethodAction, type InterestMethodFormState } from "./actions";

const inputClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";
const labelClass = "block text-sm font-medium text-on-surface";

type MethodDefaults = {
  id: string;
  name: string;
  formulaType: "SIMPLE" | "COMPOUND" | "CUSTOM";
  ratePercent: string;
  tenureMonths: number;
  dayCountBasis: string;
  compoundingFrequency: string | null;
  customFormula: string | null;
};

export default function EditInterestMethodForm({
  method,
  onDone,
}: {
  method: MethodDefaults;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<InterestMethodFormState, FormData>(
    reviseInterestMethodAction,
    undefined,
  );
  const [formulaType, setFormulaType] = useState<"SIMPLE" | "COMPOUND" | "CUSTOM">(method.formulaType);

  return (
    <form action={formAction} className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
      <input type="hidden" name="methodId" value={method.id} />
      <p className="text-xs text-on-surface-variant sm:col-span-2">
        Saving creates a new version. This method&apos;s existing plans and enrollments keep using today&apos;s
        values — only plans assigned after this change use the new version.
      </p>
      <div>
        <label htmlFor={`edit-name-${method.id}`} className={labelClass}>
          Method name
        </label>
        <input
          id={`edit-name-${method.id}`}
          name="name"
          required
          defaultValue={method.name}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`edit-formulaType-${method.id}`} className={labelClass}>
          Formula type
        </label>
        <select
          id={`edit-formulaType-${method.id}`}
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
        <label htmlFor={`edit-ratePercent-${method.id}`} className={labelClass}>
          Interest rate (% p.a.)
        </label>
        <input
          id={`edit-ratePercent-${method.id}`}
          name="ratePercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          required
          defaultValue={method.ratePercent}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`edit-tenureMonths-${method.id}`} className={labelClass}>
          Tenure basis (months)
        </label>
        <input
          id={`edit-tenureMonths-${method.id}`}
          name="tenureMonths"
          type="number"
          min="1"
          required
          defaultValue={method.tenureMonths}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`edit-dayCountBasis-${method.id}`} className={labelClass}>
          Day count basis
        </label>
        <select
          id={`edit-dayCountBasis-${method.id}`}
          name="dayCountBasis"
          required
          defaultValue={method.dayCountBasis}
          className={inputClass}
        >
          <option value="ACTUAL_365">Actual/365</option>
          <option value="ACTUAL_360">Actual/360</option>
        </select>
      </div>
      {formulaType === "COMPOUND" && (
        <div>
          <label htmlFor={`edit-compoundingFrequency-${method.id}`} className={labelClass}>
            Compounding frequency
          </label>
          <select
            id={`edit-compoundingFrequency-${method.id}`}
            name="compoundingFrequency"
            required
            defaultValue={method.compoundingFrequency ?? "MONTHLY"}
            className={inputClass}
          >
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
          <label htmlFor={`edit-customFormula-${method.id}`} className={labelClass}>
            Custom formula
          </label>
          <input
            id={`edit-customFormula-${method.id}`}
            name="customFormula"
            placeholder="Principal*(Rate/100)*Tenure"
            maxLength={100}
            required
            defaultValue={method.customFormula ?? ""}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-on-surface-variant">
            Only Principal, Rate, Tenure, ElapsedDays and + - * / ( ) are allowed. Max 100 characters, max nesting
            depth 5.
          </p>
        </div>
      )}
      {state?.error && <p className="text-sm text-error sm:col-span-2">{state.error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          Save as new version
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex min-h-touch items-center justify-center rounded-lg px-4 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
