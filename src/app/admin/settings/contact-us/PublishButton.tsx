"use client";

import { useActionState } from "react";
import { publishContactUsAction, type ContactUsActionState } from "./actions";

export function PublishButton() {
  const [state, formAction, pending] = useActionState<ContactUsActionState, FormData>(
    publishContactUsAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
      >
        Publish
      </button>
      {state?.error && <p className="text-xs text-error">{state.error}</p>}
    </form>
  );
}
