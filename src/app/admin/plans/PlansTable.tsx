"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import {
  togglePlanStatusAction,
  reassignPlanInterestMethodAction,
  type ReassignInterestMethodFormState,
} from "./actions";
import { SearchProgressBar } from "@/components/SearchProgressBar";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

type PlanRow = {
  id: string;
  name: string;
  tenureMonths: number;
  paymentFrequency: string;
  interestMethodId: string;
  interestMethodName: string;
  rewardPercent: string | null;
  commissionPercent: string;
  subscriberCount: number;
  status: string;
};

function ReassignInterestMethodForm({
  planId,
  currentMethodId,
  currentMethodName,
  methods,
}: {
  planId: string;
  currentMethodId: string;
  currentMethodName: string;
  methods: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ReassignInterestMethodFormState, FormData>(
    reassignPlanInterestMethodAction,
    undefined,
  );
  // The plan's current method may have been superseded (no longer in the
  // active list) — still show it selected so the dropdown reflects reality.
  const options = methods.some((m) => m.id === currentMethodId)
    ? methods
    : [{ id: currentMethodId, name: `${currentMethodName} (superseded)` }, ...methods];

  return (
    <form action={formAction} className="mt-1 flex items-center gap-1">
      <input type="hidden" name="planId" value={planId} />
      <select
        name="interestMethodId"
        defaultValue={currentMethodId}
        className="min-h-touch rounded-lg border border-surface-container-high bg-surface-container-low px-1 text-xs text-on-surface"
      >
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-surface-container-high px-2 py-1 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
      >
        Apply
      </button>
      {state?.error && <span className="text-xs text-error">{state.error}</span>}
    </form>
  );
}

export function PlansTable({
  plans,
  activeInterestMethods,
}: {
  plans: PlanRow[];
  activeInterestMethods: { id: string; name: string }[];
}) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredPlans = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return plans;
    return plans.filter((p) => p.name.toLowerCase().includes(query));
  }, [plans, q]);

  function runSearch(nextQ: string) {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    setSearching(true);
    setQ(nextQ);
    hideTimeout.current = setTimeout(() => setSearching(false), 300);
  }

  return (
    <>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(input);
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-on-surface-variant">
            Search
          </label>
          <div className="relative flex items-center">
            <input
              id="q"
              name="q"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Plan name"
              className={fieldClassName("w-full pr-9")}
            />
            {input ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setInput("");
                  runSearch("");
                }}
                className={buttonStyles("ghost", "icon", "absolute right-2")}
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            ) : null}
          </div>
        </div>
        <button type="submit" className={buttonStyles("primary")}>
          Search
        </button>
      </form>

      <SearchProgressBar active={searching} />

      <div className="max-h-[28rem] overflow-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-surface-container-high bg-surface-container-lowest text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Tenure</th>
              <th className="px-4 py-3">Frequency</th>
              <th className="px-4 py-3">Interest Method</th>
              <th className="px-4 py-3">Reward %</th>
              <th className="px-4 py-3">Commission %</th>
              <th className="px-4 py-3">Subscribers</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {filteredPlans.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-primary">{p.name}</td>
                <td className="px-4 py-3 text-on-surface-variant">{p.tenureMonths} mo</td>
                <td className="px-4 py-3 text-on-surface-variant">{p.paymentFrequency}</td>
                <td className="px-4 py-3 text-on-surface-variant">
                  {p.interestMethodName}
                  <ReassignInterestMethodForm
                    planId={p.id}
                    currentMethodId={p.interestMethodId}
                    currentMethodName={p.interestMethodName}
                    methods={activeInterestMethods}
                  />
                </td>
                <td className="px-4 py-3 text-on-surface-variant">
                  {p.rewardPercent ? `${p.rewardPercent}%` : "—"}
                </td>
                <td className="px-4 py-3 text-on-surface-variant">{p.commissionPercent}%</td>
                <td className="px-4 py-3 text-on-surface-variant">{p.subscriberCount}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      p.status === "ACTIVE" ? "bg-secondary-container/30 text-secondary" : "bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <form action={togglePlanStatusAction.bind(null, p.id)}>
                    <button
                      type="submit"
                      className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-2 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                    >
                      {p.status === "ACTIVE" ? "Discontinue" : "Reactivate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
