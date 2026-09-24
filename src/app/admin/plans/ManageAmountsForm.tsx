"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { updatePlanAmountsAction, type PlanAmountsFormState } from "./actions";
import { generateNumericRange } from "@/lib/range-generator";
import { formatINR } from "@/lib/format";

const inputClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";
const labelClass = "block text-sm font-medium text-on-surface";

export function ManageAmountsForm({
  plans,
  onSuccess,
}: {
  plans: { id: string; name: string; presetAmounts: number[] }[];
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState<PlanAmountsFormState, FormData>(
    updatePlanAmountsAction,
    undefined,
  );

  // See CreatePlanForm.tsx for why this watches pending's transition rather
  // than the state value.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) onSuccess?.();
    wasPending.current = pending;
  }, [pending, state, onSuccess]);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [manual, setManual] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeInterval, setRangeInterval] = useState("");
  const [rangeCount, setRangeCount] = useState("");

  const currentPlan = plans.find((p) => p.id === planId);

  const generated = useMemo(
    () => generateNumericRange(Number(rangeStart), Number(rangeInterval), Number(rangeCount)),
    [rangeStart, rangeInterval, rangeCount],
  );
  const manualValues = useMemo(
    () =>
      manual
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v) && v > 0),
    [manual],
  );
  const finalAmounts = useMemo(
    () => Array.from(new Set([...manualValues, ...generated])).sort((a, b) => a - b),
    [manualValues, generated],
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="amounts" value={finalAmounts.join(",")} />

      <div>
        <label htmlFor="amounts-planId" className={labelClass}>
          Plan
        </label>
        <select
          id="amounts-planId"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className={inputClass}
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {currentPlan && (
        <p className="text-xs text-on-surface-variant">
          Current amounts: {currentPlan.presetAmounts.map((a) => formatINR(a)).join(", ") || "—"}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="amounts-start" className={labelClass}>
            Starting amount
          </label>
          <input
            id="amounts-start"
            type="number"
            min="1"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="amounts-interval" className={labelClass}>
            Interval
          </label>
          <input
            id="amounts-interval"
            type="number"
            min="1"
            value={rangeInterval}
            onChange={(e) => setRangeInterval(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="amounts-count" className={labelClass}>
            Count
          </label>
          <input
            id="amounts-count"
            type="number"
            min="1"
            value={rangeCount}
            onChange={(e) => setRangeCount(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="amounts-manual" className={labelClass}>
          Additional manual amounts (comma separated)
        </label>
        <input
          id="amounts-manual"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="1500, 2500"
          className={inputClass}
        />
      </div>

      <fieldset className="flex items-center gap-4">
        <legend className={labelClass}>Apply as</legend>
        <label className="flex items-center gap-1.5 text-sm text-on-surface">
          <input
            type="radio"
            checked={mode === "add"}
            onChange={() => setMode("add")}
          />
          Add to existing list
        </label>
        <label className="flex items-center gap-1.5 text-sm text-on-surface">
          <input
            type="radio"
            checked={mode === "replace"}
            onChange={() => setMode("replace")}
          />
          Replace existing list
        </label>
      </fieldset>

      <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm" data-testid="amounts-preview">
        <span className="font-medium text-on-surface">Preview: </span>
        <span className="text-on-surface-variant">
          {finalAmounts.length > 0 ? finalAmounts.map((a) => formatINR(a)).join(", ") : "No amounts yet"}
        </span>
      </div>

      {state?.error && <p className="text-sm text-error">{state.error}</p>}

      <div>
        <button
          type="submit"
          disabled={pending || finalAmounts.length === 0}
          className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          Save amounts
        </button>
      </div>
    </form>
  );
}
