"use client";

import { useActionState, useState, useTransition } from "react";

type ToggleActionState = { error?: string; message?: string } | undefined;
type ToggleAction = (prev: ToggleActionState, formData: FormData) => Promise<ToggleActionState>;

// BRD Rule XLII: shared by both /dashboard/account (User) and /admin/account
// (Admin) — each page passes its own bound server action, but the UI and
// behavior are identical since the underlying preference is per-account,
// not per-role.
export default function PushNotificationToggle({
  currentValue,
  action,
}: {
  currentValue: boolean;
  action: ToggleAction;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [isPending, startTransition] = useTransition();
  // Controlled: React's DOM renderer resets a <form>'s fields to their
  // default DOM attribute values the instant a <form action={fn}> is
  // submitted — see requestFormReset$1 in react-dom-client.development.js,
  // called unconditionally at submit time, before the action even runs, not
  // after it settles. That reset would otherwise snap this checkbox straight
  // back to whatever it was first hydrated with. Passing the action to
  // onSubmit instead of the form's `action` prop keeps this a plain
  // controlled form and avoids that host-form-action reset path entirely.
  const [checked, setChecked] = useState(currentValue);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData();
        if (checked) formData.set("pushNotificationsEnabled", "on");
        startTransition(() => formAction(formData));
      }}
      className="flex max-w-sm flex-col gap-3"
    >
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="pushNotificationsEnabled"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="h-5 w-5 rounded border-outline text-primary focus:ring-2 focus:ring-primary"
        />
        <span className="flex flex-col">
          <span className="font-medium text-on-surface">Push notifications</span>
          <span className="text-xs text-on-surface-variant">
            Get notified even when this tab is closed. Turning this off only stops push delivery —
            notifications still appear in your notification list.
          </span>
        </span>
      </label>
      {state?.error ? <p className="text-sm text-error">{state.error}</p> : null}
      {state?.message ? <p className="text-sm text-secondary">{state.message}</p> : null}
      <button
        type="submit"
        disabled={pending || isPending}
        className="flex min-h-touch w-fit items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
      >
        {pending || isPending ? "Saving..." : "Save preference"}
      </button>
    </form>
  );
}
