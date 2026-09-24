"use client";

import { useActionState } from "react";
import { submitFranchiseeEnquiryAction, type RedeemState } from "../actions";

export default function FranchiseeForm({
  franchiseePlanId,
  colleges,
}: {
  franchiseePlanId: string;
  colleges: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<RedeemState, FormData>(
    submitFranchiseeEnquiryAction.bind(null, franchiseePlanId),
    undefined,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <select
        name="collegeId"
        required
        className="min-h-touch rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
      >
        <option value="">Select a college</option>
        {colleges.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || colleges.length === 0}
        className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
      >
        {pending ? "Submitting..." : "Submit enquiry"}
      </button>
      {state?.error && <p className="w-full text-xs text-error">{state.error}</p>}
    </form>
  );
}
