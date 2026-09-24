"use client";

import { useActionState } from "react";

export default function ShortfallForm({
  action,
}: {
  action: (prev: { error?: string } | undefined, formData: FormData) => Promise<{ error?: string } | undefined>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input
        name="reference"
        placeholder="Offline payment reference/receipt no."
        required
        className="min-h-touch flex-1 rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
      >
        Verify shortfall
      </button>
      {state?.error && <p className="w-full text-xs text-error">{state.error}</p>}
    </form>
  );
}
