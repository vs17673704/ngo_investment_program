"use client";

import { useActionState } from "react";
import { changeGeneralEnquiryStatusAction, type GeneralEnquiryActionState } from "./actions";
import { fieldClassName } from "@/components/ui/fieldStyles";

const STATUS_OPTIONS: { value: "NEW" | "IN_PROGRESS" | "RESOLVED"; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED", label: "Resolved" },
];

export function EnquiryStatusForm({
  enquiryId,
  currentStatus,
  currentComment,
}: {
  enquiryId: string;
  currentStatus: "NEW" | "IN_PROGRESS" | "RESOLVED";
  currentComment?: string | null;
}) {
  const action = changeGeneralEnquiryStatusAction.bind(null, enquiryId);
  const [state, formAction, pending] = useActionState<GeneralEnquiryActionState, FormData>(action, undefined);

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={`status-${enquiryId}`} className="text-xs font-medium text-on-surface-variant">
          Status
        </label>
        <select
          id={`status-${enquiryId}`}
          name="status"
          defaultValue={currentStatus}
          className={fieldClassName()}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={`comment-${enquiryId}`} className="text-xs font-medium text-on-surface-variant">
          Resolution note / admin comment
        </label>
        <input
          id={`comment-${enquiryId}`}
          name="adminComment"
          defaultValue={currentComment ?? ""}
          className={fieldClassName("w-full")}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
      >
        Update
      </button>
      {state?.error && <p className="w-full text-xs text-error">{state.error}</p>}
    </form>
  );
}
