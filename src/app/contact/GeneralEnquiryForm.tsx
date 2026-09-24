"use client";

import { useActionState } from "react";
import { submitGeneralEnquiryAction, type GeneralEnquiryFormState } from "./actions";
import { getFirebaseMessaging } from "@/lib/firebase/client";

// TEMPORARY diagnostic — logs this browser's current FCM registration token
// to the console on enquiry submission, to help verify token
// generation/registration while debugging admin push delivery. Not part of
// the enquiry submission flow itself (fire-and-forget, never blocks or
// affects the actual form action).
async function logFcmTokenToConsole() {
  try {
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.log("FCM TOKAN:", "unavailable (no VAPID key configured)");
      return;
    }
    const messaging = await getFirebaseMessaging();
    if (!messaging) {
      console.log("FCM TOKAN:", "unavailable (messaging not supported in this browser)");
      return;
    }
    const { getToken } = await import("firebase/messaging");
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    console.log("FCM TOKAN:", token ?? "unavailable (no token returned)");
  } catch (err) {
    console.log("FCM TOKAN:", "error", err);
  }
}

const inputClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";
const labelClass = "block text-sm font-medium text-on-surface";

export function GeneralEnquiryForm({
  defaultName,
  defaultEmail,
}: {
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState<GeneralEnquiryFormState, FormData>(
    submitGeneralEnquiryAction,
    undefined,
  );

  if (state?.enquiryId) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-tertiary-container bg-tertiary-container/30 p-6 text-on-surface">
        <p className="font-heading text-lg font-semibold text-tertiary">Thank you — your enquiry has been received.</p>
        <p className="text-sm text-on-surface-variant">
          Reference ID: <span className="font-mono">{state.enquiryId}</span>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input id="name" name="name" required maxLength={150} defaultValue={defaultName} className={inputClass} />
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          defaultValue={defaultEmail}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="phone" className={labelClass}>
          Phone number (optional)
        </label>
        <input id="phone" name="phone" maxLength={20} className={inputClass} />
      </div>
      <div>
        <label htmlFor="message" className={labelClass}>
          Message
        </label>
        <textarea id="message" name="message" required maxLength={5000} rows={5} className={inputClass} />
      </div>
      {/* Hidden honeypot field — a human never fills this in (Rule XXXIX.7). */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state?.error && <p className="text-sm text-error">{state.error}</p>}
      <div>
        <button
          type="submit"
          disabled={pending}
          onClick={() => {
            void logFcmTokenToConsole();
          }}
          className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          Send enquiry
        </button>
      </div>
    </form>
  );
}
