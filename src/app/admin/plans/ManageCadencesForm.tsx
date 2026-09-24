"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { updatePlanCadencesAction, type PlanCadencesFormState } from "./actions";
import {
  generateCadenceRange,
  cadenceKey,
  formatCadence,
  dedupeCadences,
  type Cadence,
  type CadenceUnit,
} from "@/lib/range-generator";

const inputClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";
const labelClass = "block text-sm font-medium text-on-surface";

export function ManageCadencesForm({
  plans,
  onSuccess,
}: {
  plans: { id: string; name: string; paymentCadences: Cadence[] }[];
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState<PlanCadencesFormState, FormData>(
    updatePlanCadencesAction,
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
  const [unit, setUnit] = useState<CadenceUnit>("MONTH");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeInterval, setRangeInterval] = useState("");
  const [rangeCount, setRangeCount] = useState("");
  const [manualUnit, setManualUnit] = useState<CadenceUnit>("MONTH");
  const [manualInterval, setManualInterval] = useState("");

  const currentPlan = plans.find((p) => p.id === planId);

  const generated = useMemo(
    () => generateCadenceRange(unit, Number(rangeStart), Number(rangeInterval), Number(rangeCount)),
    [unit, rangeStart, rangeInterval, rangeCount],
  );
  const manualCadence: Cadence[] =
    Number.isInteger(Number(manualInterval)) && Number(manualInterval) > 0
      ? [{ unit: manualUnit, interval: Number(manualInterval) }]
      : [];
  const finalCadences = useMemo(
    () => dedupeCadences([...manualCadence, ...generated]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manualCadence, generated],
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="cadences" value={finalCadences.map(cadenceKey).join(",")} />

      <div>
        <label htmlFor="cadences-planId" className={labelClass}>
          Plan
        </label>
        <select
          id="cadences-planId"
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
          Current durations: {currentPlan.paymentCadences.map(formatCadence).join(", ") || "—"}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="cadences-unit" className={labelClass}>
            Unit
          </label>
          <select
            id="cadences-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as CadenceUnit)}
            className={inputClass}
          >
            <option value="DAY">Day</option>
            <option value="WEEK">Week</option>
            <option value="MONTH">Month</option>
          </select>
        </div>
        <div>
          <label htmlFor="cadences-start" className={labelClass}>
            Starting number
          </label>
          <input
            id="cadences-start"
            type="number"
            min="1"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="cadences-interval" className={labelClass}>
            Interval
          </label>
          <input
            id="cadences-interval"
            type="number"
            min="1"
            value={rangeInterval}
            onChange={(e) => setRangeInterval(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="cadences-count" className={labelClass}>
            Count
          </label>
          <input
            id="cadences-count"
            type="number"
            min="1"
            value={rangeCount}
            onChange={(e) => setRangeCount(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        A range generator produces numeric steps within one unit only (e.g. Every 1/2/3 Month) — it never escalates
        across units.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="cadences-manual-unit" className={labelClass}>
            Additional manual duration — unit
          </label>
          <select
            id="cadences-manual-unit"
            value={manualUnit}
            onChange={(e) => setManualUnit(e.target.value as CadenceUnit)}
            className={inputClass}
          >
            <option value="DAY">Day</option>
            <option value="WEEK">Week</option>
            <option value="MONTH">Month</option>
          </select>
        </div>
        <div>
          <label htmlFor="cadences-manual-interval" className={labelClass}>
            Number
          </label>
          <input
            id="cadences-manual-interval"
            type="number"
            min="1"
            value={manualInterval}
            onChange={(e) => setManualInterval(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <fieldset className="flex items-center gap-4">
        <legend className={labelClass}>Apply as</legend>
        <label className="flex items-center gap-1.5 text-sm text-on-surface">
          <input type="radio" checked={mode === "add"} onChange={() => setMode("add")} />
          Add to existing list
        </label>
        <label className="flex items-center gap-1.5 text-sm text-on-surface">
          <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
          Replace existing list
        </label>
      </fieldset>

      <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm" data-testid="cadences-preview">
        <span className="font-medium text-on-surface">Preview: </span>
        <span className="text-on-surface-variant">
          {finalCadences.length > 0 ? finalCadences.map(formatCadence).join(", ") : "No durations yet"}
        </span>
      </div>

      {state?.error && <p className="text-sm text-error">{state.error}</p>}

      <div>
        <button
          type="submit"
          disabled={pending || finalCadences.length === 0}
          className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          Save payment durations
        </button>
      </div>
    </form>
  );
}
