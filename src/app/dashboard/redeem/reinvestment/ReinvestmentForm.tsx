"use client";

import { useActionState } from "react";
import { submitReinvestmentRedemptionAction, type RedeemState } from "../actions";
import { Icon } from "@/components/Icon";

type PlanOption = { id: string; name: string; tenureMonths: number };

export default function ReinvestmentForm({ plans }: { plans: PlanOption[] }) {
  const [state, formAction, pending] = useActionState<RedeemState, FormData>(
    submitReinvestmentRedemptionAction,
    undefined,
  );

  return (
    <form action={formAction} className="mt-4 flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-on-surface">Amount (₹)</span>
        <div className="relative flex items-center">
          <Icon name="currency_rupee" className="pointer-events-none absolute left-3 text-[20px] text-on-surface-variant" />
          <input
            name="amount"
            type="number"
            min="1"
            step="0.01"
            required
            className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-3 pl-10 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-on-surface">Reinvest into plan</span>
        <select
          name="targetPlanId"
          required
          defaultValue=""
          className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
        >
          <option value="" disabled>
            Select a plan
          </option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} ({plan.tenureMonths} months)
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-on-surface">Comments (optional)</span>
        <textarea
          name="comments"
          rows={3}
          className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </label>
      {state?.error && <p className="text-sm text-error">{state.error}</p>}
      <button
        type="submit"
        disabled={pending || plans.length === 0}
        className="flex min-h-touch w-fit items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
      >
        {pending ? "Submitting..." : "Submit request"}
      </button>
      {plans.length === 0 && (
        <p className="text-sm text-on-surface-variant">No active plans are currently available to reinvest into.</p>
      )}
    </form>
  );
}
