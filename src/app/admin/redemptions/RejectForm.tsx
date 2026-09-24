"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/Button";

export default function RejectForm({
  action,
}: {
  action: (prev: { error?: string } | undefined, formData: FormData) => Promise<{ error?: string } | undefined>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        name="reason"
        placeholder="Reason (optional, shown to the user)"
        className="min-h-touch w-56 rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
      />
      <button type="submit" disabled={pending} className={buttonStyles("secondary")}>
        Reject
      </button>
      {state?.error && <p className="w-full text-xs text-error">{state.error}</p>}
    </form>
  );
}
