"use client";

import { useActionState, useEffect, useRef } from "react";
import { addAboutUsSectionAction, type AboutUsActionState } from "./actions";

const inputClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";

export function AddSectionForm() {
  const [state, formAction, pending] = useActionState<AboutUsActionState, FormData>(
    addAboutUsSectionAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-on-surface-variant">Heading (optional)</label>
        <input name="heading" maxLength={150} className={inputClass} />
      </div>
      <div>
        <label className="text-xs font-medium text-on-surface-variant">Paragraph</label>
        <textarea name="body" required maxLength={20000} rows={4} className={inputClass} />
      </div>
      {state?.error && <p className="text-xs text-error">{state.error}</p>}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          Add section
        </button>
      </div>
    </form>
  );
}
