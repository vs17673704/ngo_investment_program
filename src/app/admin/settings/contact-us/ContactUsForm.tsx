"use client";

import { useActionState } from "react";
import { saveContactUsDraftAction, type ContactUsActionState } from "./actions";
import type { SocialLink } from "@/lib/validation/contact-us";

const inputClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";

function socialLinksToLines(links: SocialLink[]): string {
  return links.map((l) => `${l.label} | ${l.url}`).join("\n");
}

export function ContactUsForm({
  address,
  phone,
  email,
  website,
  socialLinks,
}: {
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  socialLinks: SocialLink[];
}) {
  const [state, formAction, pending] = useActionState<ContactUsActionState, FormData>(
    saveContactUsDraftAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-on-surface-variant">Address</label>
        <input name="address" defaultValue={address ?? ""} maxLength={1000} className={inputClass} />
      </div>
      <div>
        <label className="text-xs font-medium text-on-surface-variant">Phone</label>
        <input name="phone" defaultValue={phone ?? ""} maxLength={20} className={inputClass} />
      </div>
      <div>
        <label className="text-xs font-medium text-on-surface-variant">Email</label>
        <input name="email" type="email" defaultValue={email ?? ""} maxLength={254} className={inputClass} />
      </div>
      <div>
        <label className="text-xs font-medium text-on-surface-variant">Website</label>
        <input name="website" type="url" defaultValue={website ?? ""} maxLength={2048} className={inputClass} />
      </div>
      <div>
        <label className="text-xs font-medium text-on-surface-variant">
          Social links (one per line, format: Label | https://url)
        </label>
        <textarea
          name="socialLinks"
          defaultValue={socialLinksToLines(socialLinks)}
          rows={4}
          className={inputClass}
        />
      </div>
      {state?.error && <p className="text-xs text-error">{state.error}</p>}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
        >
          Save Draft
        </button>
      </div>
    </form>
  );
}
