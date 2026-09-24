"use client";

import { RADIUS_PRESETS, type RadiusPresetKey } from "@/lib/theme";

type PreviewTheme = {
  primaryColor: string;
  onPrimaryColor: string;
  secondaryColor: string;
  onSecondaryColor: string;
  backgroundColor: string;
  cardColor: string;
  textPrimaryColor: string;
  textSecondaryColor: string;
  errorColor: string;
  borderColor: string;
  borderRadiusPreset: string;
};

/** Renders a small live mock using the exact same token-driven approach as
 * the real app (CSS custom properties scoped to this subtree), so what the
 * admin sees here matches what publishing will actually produce. */
export default function ThemePreview({ theme }: { theme: PreviewTheme }) {
  const radiusKey = (theme.borderRadiusPreset in RADIUS_PRESETS ? theme.borderRadiusPreset : "standard") as RadiusPresetKey;
  const radius = RADIUS_PRESETS[radiusKey];

  const vars = {
    "--preview-primary": theme.primaryColor,
    "--preview-on-primary": theme.onPrimaryColor,
    "--preview-secondary": theme.secondaryColor,
    "--preview-on-secondary": theme.onSecondaryColor,
    "--preview-bg": theme.backgroundColor,
    "--preview-card": theme.cardColor,
    "--preview-text": theme.textPrimaryColor,
    "--preview-text-secondary": theme.textSecondaryColor,
    "--preview-error": theme.errorColor,
    "--preview-border": theme.borderColor,
    "--preview-radius-card": radius.card,
    "--preview-radius-button": radius.button,
  } as React.CSSProperties;

  return (
    <div
      style={{ ...vars, background: "var(--preview-bg)", color: "var(--preview-text)" }}
      className="flex flex-col gap-3 rounded-xl border p-4 text-sm"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--preview-text-secondary)" }}>
        Live Preview
      </h2>

      <div
        style={{ background: "var(--preview-card)", borderRadius: "var(--preview-radius-card)", borderColor: "var(--preview-border)" }}
        className="flex flex-col gap-2 border p-3"
      >
        <p className="font-medium">Dashboard card</p>
        <p style={{ color: "var(--preview-text-secondary)" }}>Secondary text sample</p>
        <span
          style={{ background: "var(--preview-secondary)", color: "var(--preview-on-secondary)", borderRadius: "var(--preview-radius-button)" }}
          className="w-fit px-2 py-0.5 text-xs font-semibold"
        >
          Active
        </span>
      </div>

      <button
        type="button"
        style={{ background: "var(--preview-primary)", color: "var(--preview-on-primary)", borderRadius: "var(--preview-radius-button)" }}
        className="min-h-[2.25rem] px-4 text-sm font-medium"
      >
        Primary button
      </button>

      <p style={{ color: "var(--preview-error)" }} className="text-xs font-medium">
        Error message sample
      </p>
    </div>
  );
}
