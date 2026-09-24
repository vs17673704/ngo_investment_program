"use client";

import { useActionState } from "react";
import {
  updateAboutUsSectionAction,
  removeAboutUsSectionAction,
  moveAboutUsSectionAction,
  type AboutUsActionState,
} from "./actions";
import { Icon } from "@/components/Icon";

const inputClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";

export function SectionEditor({
  id,
  heading,
  body,
  isFirst,
  isLast,
}: {
  id: string;
  heading: string | null;
  body: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [state, formAction, pending] = useActionState<AboutUsActionState, FormData>(
    updateAboutUsSectionAction,
    undefined,
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <form action={moveAboutUsSectionAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={isFirst}
              aria-label="Move section up"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-30"
            >
              <Icon name="arrow_upward" className="text-[18px]" />
            </button>
          </form>
          <form action={moveAboutUsSectionAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              disabled={isLast}
              aria-label="Move section down"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-30"
            >
              <Icon name="arrow_downward" className="text-[18px]" />
            </button>
          </form>
        </div>
        <form
          action={removeAboutUsSectionAction}
          onSubmit={(e) => {
            if (!confirm("Remove this section? This cannot be undone.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            aria-label="Remove section"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-error transition-colors hover:bg-error-container"
          >
            <Icon name="delete" className="text-[18px]" />
          </button>
        </form>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        <div>
          <label className="text-xs font-medium text-on-surface-variant">Heading (optional)</label>
          <input name="heading" defaultValue={heading ?? ""} maxLength={150} className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant">Paragraph</label>
          <textarea name="body" defaultValue={body} required maxLength={20000} rows={4} className={inputClass} />
        </div>
        {state?.error && <p className="text-xs text-error">{state.error}</p>}
        <div>
          <button
            type="submit"
            disabled={pending}
            className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
