"use client";

import { useActionState, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import {
  saveDraftAction,
  publishAction,
  rollbackAction,
  resetAction,
  type ThemeFormState,
  type PublishState,
} from "./actions";
import { COLOR_FIELDS, FONT_OPTIONS, RADIUS_PRESETS, type ColorField } from "@/lib/theme";
import ThemePreview from "./ThemePreview";

type ThemeRow = {
  id: string;
  version: number;
  status: string;
  appName: string | null;
  logoUrl: string | null;
  loginLogoUrl: string | null;
  faviconUrl: string | null;
  loginTitle: string | null;
  loginSubtitle: string | null;
  welcomeText: string | null;
  primaryButtonLabel: string | null;
  supportText: string | null;
  footerText: string | null;
  loginBackgroundType: string;
  loginBackgroundUrl: string | null;
  loginBackgroundPosition: string;
  loginBackgroundSize: string;
  loginOverlayEnabled: boolean;
  loginOverlayColor: string;
  loginOverlayOpacity: number;
  primaryColor: string;
  onPrimaryColor: string;
  secondaryColor: string;
  onSecondaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  cardColor: string;
  textPrimaryColor: string;
  textSecondaryColor: string;
  successColor: string;
  warningColor: string;
  errorColor: string;
  infoColor: string;
  borderColor: string;
  fontFamily: string;
  headingFontFamily: string;
  baseFontSize: number;
  borderRadiusPreset: string;
  publishedAt: string | null;
  publishedByUser?: { email: string } | null;
};

const inputClass =
  "mt-1 min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none";
const labelClass = "block text-sm font-medium text-on-surface";
const sectionClass = "flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-sm";

const COLOR_LABELS: Record<ColorField, string> = {
  primaryColor: "Primary",
  onPrimaryColor: "Text on primary",
  secondaryColor: "Secondary",
  onSecondaryColor: "Text on secondary",
  backgroundColor: "Page background",
  surfaceColor: "Surface / panels",
  cardColor: "Cards",
  textPrimaryColor: "Primary text",
  textSecondaryColor: "Secondary text",
  successColor: "Success",
  warningColor: "Warning",
  errorColor: "Error",
  infoColor: "Info",
  borderColor: "Borders",
};

function ColorField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded border border-outline-variant bg-transparent p-0.5"
        />
        <input
          id={name}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          pattern="^#[0-9a-fA-F]{6}$"
          required
          className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </div>
    </div>
  );
}

function CurrentAssetPreview({ label, currentUrl }: { label: string; currentUrl: string | null }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3">
      <span className={labelClass}>{label}</span>
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt={label} className="h-16 w-full rounded object-contain bg-surface-container" />
      ) : (
        <p className="text-xs text-on-surface-variant">Not set.</p>
      )}
    </div>
  );
}

export default function ThemeEditor({
  draft,
  published,
  history,
}: {
  draft: ThemeRow;
  published: ThemeRow | null;
  history: ThemeRow[];
}) {
  const [tab, setTab] = useState<"branding" | "login" | "colors" | "typography" | "history">("branding");
  const [saveState, saveFormAction, savePending] = useActionState<ThemeFormState, FormData>(
    saveDraftAction,
    undefined,
  );
  const [publishPending, startPublish] = useTransition();
  const [publishResult, setPublishResult] = useState<PublishState>(undefined);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);

  function refresh() {
    // Server actions already revalidatePath("/admin/theme"); reloading
    // pulls the freshly-persisted draft into this client component.
    window.location.reload();
  }

  const TABS: { key: typeof tab; label: string }[] = [
    { key: "branding", label: "Branding" },
    { key: "login", label: "Login Screen" },
    { key: "colors", label: "Colors" },
    { key: "typography", label: "Typography & Style" },
    { key: "history", label: "Version History" },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-1 rounded-xl bg-surface-container-lowest p-1 shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`min-h-touch rounded-lg px-3 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form action={saveFormAction} className="flex flex-col gap-6">
          {
            /* Every tab's fields stay mounted at all times (visibility
               toggled with `hidden`, not conditional rendering) so that
               switching tabs never unmounts/discards edits, and so a single
               "Save Draft" submit always includes every required field
               (color fields have no .optional() in the Zod schema) no
               matter which tab is currently active. */
          }
          <section className={`${sectionClass} ${tab === "branding" ? "" : "hidden"}`}>
              <h2 className="font-heading text-lg font-semibold text-primary">Branding</h2>
              <div>
                <label htmlFor="appName" className={labelClass}>
                  Application name
                </label>
                <input
                  id="appName"
                  name="appName"
                  defaultValue={draft.appName ?? ""}
                  placeholder="NexVest"
                  maxLength={200}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <CurrentAssetPreview label="Logo" currentUrl={draft.logoUrl} />
                <CurrentAssetPreview label="Favicon" currentUrl={draft.faviconUrl} />
                <CurrentAssetPreview label="Login logo" currentUrl={draft.loginLogoUrl} />
              </div>
              <div>
                <label htmlFor="footerText" className={labelClass}>
                  Footer text
                </label>
                <input id="footerText" name="footerText" defaultValue={draft.footerText ?? ""} maxLength={200} className={inputClass} />
              </div>
              <div>
                <label htmlFor="supportText" className={labelClass}>
                  Support text
                </label>
                <input id="supportText" name="supportText" defaultValue={draft.supportText ?? ""} maxLength={200} className={inputClass} />
              </div>
          </section>

          <section className={`${sectionClass} ${tab === "login" ? "" : "hidden"}`}>
              <h2 className="font-heading text-lg font-semibold text-primary">Login Screen</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="loginTitle" className={labelClass}>
                    Title
                  </label>
                  <input id="loginTitle" name="loginTitle" defaultValue={draft.loginTitle ?? ""} maxLength={200} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="loginSubtitle" className={labelClass}>
                    Subtitle
                  </label>
                  <input id="loginSubtitle" name="loginSubtitle" defaultValue={draft.loginSubtitle ?? ""} maxLength={200} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="welcomeText" className={labelClass}>
                    Welcome text
                  </label>
                  <input id="welcomeText" name="welcomeText" defaultValue={draft.welcomeText ?? ""} maxLength={200} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="primaryButtonLabel" className={labelClass}>
                    Primary button label
                  </label>
                  <input id="primaryButtonLabel" name="primaryButtonLabel" defaultValue={draft.primaryButtonLabel ?? ""} maxLength={200} className={inputClass} />
                </div>
              </div>

              <CurrentAssetPreview label="Login wallpaper image" currentUrl={draft.loginBackgroundUrl} />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="loginBackgroundType" className={labelClass}>
                    Background type
                  </label>
                  <select id="loginBackgroundType" name="loginBackgroundType" defaultValue={draft.loginBackgroundType} className={inputClass}>
                    <option value="SOLID">Solid</option>
                    <option value="GRADIENT">Gradient (primary → secondary)</option>
                    <option value="IMAGE">Image</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="loginBackgroundPosition" className={labelClass}>
                    Position
                  </label>
                  <select id="loginBackgroundPosition" name="loginBackgroundPosition" defaultValue={draft.loginBackgroundPosition} className={inputClass}>
                    <option value="CENTER">Center</option>
                    <option value="TOP">Top</option>
                    <option value="RIGHT">Right</option>
                    <option value="BOTTOM">Bottom</option>
                    <option value="LEFT">Left</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="loginBackgroundSize" className={labelClass}>
                    Size
                  </label>
                  <select id="loginBackgroundSize" name="loginBackgroundSize" defaultValue={draft.loginBackgroundSize} className={inputClass}>
                    <option value="COVER">Cover</option>
                    <option value="CONTAIN">Contain</option>
                    <option value="AUTO">Auto</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-medium text-on-surface">
                  <input type="checkbox" name="loginOverlayEnabled" value="true" defaultChecked={draft.loginOverlayEnabled} className="h-4 w-4" />
                  Enable dark overlay
                </label>
                <div>
                  <label htmlFor="loginOverlayColor" className="sr-only">
                    Overlay color
                  </label>
                  <input type="color" id="loginOverlayColor" name="loginOverlayColor" defaultValue={draft.loginOverlayColor} className="h-9 w-9 cursor-pointer rounded border border-outline-variant bg-transparent p-0.5" />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="loginOverlayOpacity" className="text-sm text-on-surface-variant">
                    Opacity
                  </label>
                  <input type="number" id="loginOverlayOpacity" name="loginOverlayOpacity" min={0} max={100} defaultValue={draft.loginOverlayOpacity} className="min-h-touch w-20 rounded-lg border border-outline-variant bg-surface-container-low px-2 text-sm" />
                </div>
              </div>
          </section>

          <section className={`${sectionClass} ${tab === "colors" ? "" : "hidden"}`}>
              <h2 className="font-heading text-lg font-semibold text-primary">Colors</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {COLOR_FIELDS.map((field) => (
                  <ColorField key={field} name={field} label={COLOR_LABELS[field]} defaultValue={draft[field]} />
                ))}
              </div>
          </section>

          <section className={`${sectionClass} ${tab === "typography" ? "" : "hidden"}`}>
              <h2 className="font-heading text-lg font-semibold text-primary">Typography &amp; Style</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="fontFamily" className={labelClass}>
                    Body font
                  </label>
                  <select id="fontFamily" name="fontFamily" defaultValue={draft.fontFamily} className={inputClass}>
                    {Object.entries(FONT_OPTIONS).map(([key, opt]) => (
                      <option key={key} value={key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="headingFontFamily" className={labelClass}>
                    Heading font
                  </label>
                  <select id="headingFontFamily" name="headingFontFamily" defaultValue={draft.headingFontFamily} className={inputClass}>
                    {Object.entries(FONT_OPTIONS).map(([key, opt]) => (
                      <option key={key} value={key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="baseFontSize" className={labelClass}>
                    Base font size (px)
                  </label>
                  <input type="number" id="baseFontSize" name="baseFontSize" min={14} max={18} defaultValue={draft.baseFontSize} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="borderRadiusPreset" className={labelClass}>
                    Corner style
                  </label>
                  <select id="borderRadiusPreset" name="borderRadiusPreset" defaultValue={draft.borderRadiusPreset} className={inputClass}>
                    {Object.entries(RADIUS_PRESETS).map(([key, opt]) => (
                      <option key={key} value={key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-on-surface-variant">
                Dark mode is not yet available — the design system currently defines light-mode colors only.
              </p>
          </section>

          {tab !== "history" && (
            <div className="flex flex-col gap-2">
              {saveState?.error && <p className="text-sm text-error">{saveState.error}</p>}
              {saveState?.success && <p className="text-sm text-secondary">Draft saved.</p>}
              {saveState?.warnings?.map((w) => (
                <p key={w} className="text-xs text-warning">
                  ⚠ {w}
                </p>
              ))}
              <button
                type="submit"
                disabled={savePending}
                className="flex min-h-touch w-fit items-center gap-1 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm disabled:opacity-50"
              >
                <Icon name="save" className="text-[18px]" />
                Save Draft
              </button>
            </div>
          )}
        </form>

        {tab === "history" && (
          <section className={sectionClass}>
            <h2 className="font-heading text-lg font-semibold text-primary">Version History</h2>
            {history.length === 0 && <p className="text-sm text-on-surface-variant">No archived versions yet.</p>}
            <ul className="flex flex-col divide-y divide-surface-container">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="text-sm">
                    <span className="font-medium text-on-surface">Version {h.version}</span>
                    <span className="ml-2 text-xs text-on-surface-variant">
                      {h.publishedAt ? new Date(h.publishedAt).toLocaleString() : "—"}
                      {h.publishedByUser?.email ? ` · ${h.publishedByUser.email}` : ""}
                    </span>
                  </div>
                  {confirmRollback === h.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-error">Roll back and replace the live theme?</span>
                      <button
                        type="button"
                        disabled={publishPending}
                        onClick={() =>
                          startPublish(async () => {
                            const res = await rollbackAction(h.id);
                            setPublishResult(res);
                            setConfirmRollback(null);
                            refresh();
                          })
                        }
                        className="rounded-lg bg-error px-2 py-1 text-xs font-medium text-white"
                      >
                        Confirm
                      </button>
                      <button type="button" onClick={() => setConfirmRollback(null)} className="text-xs text-on-surface-variant">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRollback(h.id)}
                      className="rounded-lg border border-outline-variant px-2 py-1 text-xs font-medium text-on-surface hover:bg-surface-container"
                    >
                      Roll back to this
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <section className={sectionClass}>
          <h2 className="font-heading text-base font-semibold text-primary">Status</h2>
          <div className="text-sm text-on-surface-variant">
            <p>
              Live: <span className="font-medium text-on-surface">v{published?.version ?? "—"}</span>
              {published?.publishedAt && ` · ${new Date(published.publishedAt).toLocaleDateString()}`}
            </p>
            <p>
              Draft: <span className="font-medium text-on-surface">unsaved changes are in this editor</span>
            </p>
          </div>

          {publishResult?.error && <p className="text-sm text-error">{publishResult.error}</p>}
          {publishResult?.success && <p className="text-sm text-secondary">Published.</p>}

          {confirmPublish ? (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs text-on-surface">
              <p>Publish will make the draft the live theme for every visitor immediately.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={publishPending}
                  onClick={() =>
                    startPublish(async () => {
                      const res = await publishAction();
                      setPublishResult(res);
                      setConfirmPublish(false);
                      if (res?.success) refresh();
                    })
                  }
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary"
                >
                  Confirm Publish
                </button>
                <button type="button" onClick={() => setConfirmPublish(false)} className="text-xs text-on-surface-variant">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmPublish(true)}
              className="flex min-h-touch items-center justify-center gap-1 rounded-lg bg-secondary px-4 text-sm font-medium text-on-secondary shadow-sm"
            >
              <Icon name="publish" className="text-[18px]" />
              Publish
            </button>
          )}

          {confirmReset ? (
            <div className="flex flex-col gap-2 rounded-lg border border-error/50 bg-error/10 p-3 text-xs text-on-surface">
              <p>Reset will discard all customization and restore the built-in default theme.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={publishPending}
                  onClick={() =>
                    startPublish(async () => {
                      const res = await resetAction();
                      setPublishResult(res);
                      setConfirmReset(false);
                      if (res?.success) refresh();
                    })
                  }
                  className="rounded-lg bg-error px-3 py-1.5 text-xs font-medium text-white"
                >
                  Confirm Reset
                </button>
                <button type="button" onClick={() => setConfirmReset(false)} className="text-xs text-on-surface-variant">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex min-h-touch items-center justify-center gap-1 rounded-lg border border-error/50 px-4 text-sm font-medium text-error"
            >
              <Icon name="restart_alt" className="text-[18px]" />
              Reset to Default
            </button>
          )}
        </section>

        <ThemePreview theme={draft} />
      </div>
    </div>
  );
}
