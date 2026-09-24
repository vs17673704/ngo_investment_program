"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import {
  createUniversityAction,
  createCourseAction,
  createGadgetAction,
  createCollegeAction,
  createFranchiseePlanAction,
  createDonationRecipientAction,
  setDonationRecipientActiveAction,
  adjustGadgetStockAction,
  type FormState,
} from "./actions";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

const inputClass = fieldClassName("mt-1");
const labelClass = "block text-sm font-medium text-on-surface";
const buttonClass = buttonStyles("primary");

function ErrorText({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return <p className="text-sm text-error sm:col-span-2">{state.error}</p>;
}

export function CreateUniversityForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createUniversityAction,
    undefined,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className={labelClass}>University name</label>
        <input name="name" required className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        Add university
      </button>
      <ErrorText state={state} />
    </form>
  );
}

export function CreateCourseForm({ universities }: { universities: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createCourseAction,
    undefined,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className={labelClass}>University</label>
        <select name="universityId" required className={inputClass}>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Course name</label>
        <input name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Fee (₹)</label>
        <input name="fee" type="number" min="1" step="0.01" required className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        Add course
      </button>
      <ErrorText state={state} />
    </form>
  );
}

export function CreateGadgetForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createGadgetAction,
    undefined,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className={labelClass}>Category</label>
        <input name="category" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Name</label>
        <input name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Price (₹)</label>
        <input name="price" type="number" min="1" step="0.01" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Stock</label>
        <input name="stockQuantity" type="number" min="0" required className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        Add gadget
      </button>
      <ErrorText state={state} />
    </form>
  );
}

export function AdjustStockForm({ gadgetId }: { gadgetId: string }) {
  const action = adjustGadgetStockAction.bind(null, gadgetId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <input
          name="delta"
          type="number"
          step="1"
          placeholder="+/- qty"
          className={fieldClassName("w-24")}
        />
        <button type="submit" disabled={pending} className={buttonStyles("secondary")}>
          Apply
        </button>
      </div>
      {state?.error && <p className="text-xs text-error">{state.error}</p>}
    </form>
  );
}

export function CreateCollegeForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createCollegeAction,
    undefined,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className={labelClass}>College name</label>
        <input name="name" required className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        Add college
      </button>
      <ErrorText state={state} />
    </form>
  );
}

export function CreateDonationRecipientForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createDonationRecipientAction,
    undefined,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className={labelClass}>Recipient name</label>
        <input name="name" required className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        Add recipient
      </button>
      <ErrorText state={state} />
    </form>
  );
}

export function ToggleDonationRecipientActiveButton({
  recipientId,
  active,
}: {
  recipientId: string;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => setDonationRecipientActiveAction(recipientId, !active))}
      className={buttonStyles("secondary")}
    >
      {active ? "Deactivate" : "Activate"}
    </button>
  );
}

export function CreateFranchiseePlanForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createFranchiseePlanAction,
    undefined,
  );

  // Same pending-transition detection as admin/plans' CreatePlanForm: the
  // action returns undefined on both the initial render and a successful
  // submit, so a completed submit with no error is what actually signals
  // success here.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) onSuccess?.();
    wasPending.current = pending;
  }, [pending, state, onSuccess]);

  return (
    <form action={formAction} className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass}>Plan name</label>
        <input name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>One-time deductible price (₹)</label>
        <input
          name="oneTimeDeductiblePrice"
          type="number"
          min="1"
          step="0.01"
          required
          className={inputClass}
        />
      </div>
      {state?.error && <p className="text-sm text-error sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          Create franchisee plan
        </button>
      </div>
    </form>
  );
}
