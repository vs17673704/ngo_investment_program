"use client";

import { useActionState } from "react";
import { SETTINGS_SCHEMA, type Settings, type SettingKey } from "@/lib/config";
import { updateSettingsAction, type SettingsState } from "./actions";

export default function SettingsForm({ current }: { current: Settings }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateSettingsAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {(Object.keys(SETTINGS_SCHEMA) as SettingKey[]).map((key) => {
        const schema = SETTINGS_SCHEMA[key];
        return (
          <div key={key}>
            <label htmlFor={key} className="block text-sm font-medium text-on-surface">
              {schema.label}
            </label>
            <input
              id={key}
              name={key}
              type="number"
              min={schema.min}
              max={schema.max}
              step={1}
              defaultValue={current[key]}
              className="mt-1 min-h-touch w-full max-w-xs rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
            />
            <p className="mt-0.5 text-xs text-on-surface-variant">
              Range: {schema.min}–{schema.max}
            </p>
          </div>
        );
      })}

      {state?.error && <p className="text-sm text-error">{state.error}</p>}
      {state?.success && <p className="text-sm text-secondary">Settings saved.</p>}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          Save settings
        </button>
      </div>
    </form>
  );
}
