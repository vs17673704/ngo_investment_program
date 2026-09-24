import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { ThemeConfig } from "@prisma/client";

// Admin-configurable website theme/branding. See Complete Website Theme
// Management.md for the full feature spec. The DB always has at most one
// PUBLISHED row (the live theme) and at most one DRAFT row (the admin's
// working copy); everything else is ARCHIVED history used for rollback.

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const FONT_OPTIONS = {
  inter: { label: "Inter (default)", cssVar: "var(--font-inter)" },
  jakarta: { label: "Plus Jakarta Sans", cssVar: "var(--font-jakarta)" },
} as const;
export type FontKey = keyof typeof FONT_OPTIONS;

export const RADIUS_PRESETS = {
  sharp: { label: "Sharp", button: "0.25rem", card: "0.375rem", input: "0.25rem" },
  standard: { label: "Standard", button: "0.5rem", card: "0.75rem", input: "0.5rem" },
  rounded: { label: "Rounded", button: "9999px", card: "1.25rem", input: "0.75rem" },
} as const;
export type RadiusPresetKey = keyof typeof RADIUS_PRESETS;

export const BACKGROUND_TYPES = ["IMAGE", "GRADIENT", "SOLID"] as const;
export const BACKGROUND_POSITIONS = ["CENTER", "TOP", "RIGHT", "BOTTOM", "LEFT"] as const;
export const BACKGROUND_SIZES = ["COVER", "CONTAIN", "AUTO"] as const;

export const COLOR_FIELDS = [
  "primaryColor",
  "onPrimaryColor",
  "secondaryColor",
  "onSecondaryColor",
  "backgroundColor",
  "surfaceColor",
  "cardColor",
  "textPrimaryColor",
  "textSecondaryColor",
  "successColor",
  "warningColor",
  "errorColor",
  "infoColor",
  "borderColor",
] as const;
export type ColorField = (typeof COLOR_FIELDS)[number];

export const TEXT_FIELDS = [
  "appName",
  "loginTitle",
  "loginSubtitle",
  "welcomeText",
  "primaryButtonLabel",
  "supportText",
  "footerText",
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

// Literal defaults mirroring today's hardcoded src/app/globals.css values —
// used as the built-in fallback if the DB is ever unavailable/empty, and as
// the source for Reset Theme.
export const DEFAULT_THEME = {
  appName: null as string | null,
  logoUrl: null as string | null,
  loginLogoUrl: null as string | null,
  faviconUrl: null as string | null,
  loginTitle: null as string | null,
  loginSubtitle: null as string | null,
  welcomeText: null as string | null,
  primaryButtonLabel: null as string | null,
  supportText: null as string | null,
  footerText: null as string | null,

  loginBackgroundType: "SOLID" as (typeof BACKGROUND_TYPES)[number],
  loginBackgroundUrl: null as string | null,
  loginBackgroundPosition: "CENTER" as (typeof BACKGROUND_POSITIONS)[number],
  loginBackgroundSize: "COVER" as (typeof BACKGROUND_SIZES)[number],
  loginOverlayEnabled: false,
  loginOverlayColor: "#000000",
  loginOverlayOpacity: 40,

  primaryColor: "#000000",
  onPrimaryColor: "#ffffff",
  secondaryColor: "#006c4a",
  onSecondaryColor: "#ffffff",
  backgroundColor: "#fbf8fc",
  surfaceColor: "#f0edf1",
  cardColor: "#ffffff",
  textPrimaryColor: "#1b1b1e",
  textSecondaryColor: "#47464a",
  successColor: "#006c4a",
  warningColor: "#c76c00",
  errorColor: "#ba1a1a",
  infoColor: "#0b57d0",
  borderColor: "#c8c5ca",

  fontFamily: "inter" as FontKey,
  headingFontFamily: "jakarta" as FontKey,
  baseFontSize: 16,
  borderRadiusPreset: "standard" as RadiusPresetKey,
  themeMode: "LIGHT" as const,
} satisfies Record<string, unknown>;

export type ThemeValues = typeof DEFAULT_THEME;

function toThemeValues(row: ThemeConfig): ThemeValues {
  return {
    appName: row.appName,
    logoUrl: row.logoUrl,
    loginLogoUrl: row.loginLogoUrl,
    faviconUrl: row.faviconUrl,
    loginTitle: row.loginTitle,
    loginSubtitle: row.loginSubtitle,
    welcomeText: row.welcomeText,
    primaryButtonLabel: row.primaryButtonLabel,
    supportText: row.supportText,
    footerText: row.footerText,

    loginBackgroundType: (row.loginBackgroundType as ThemeValues["loginBackgroundType"]) ?? "SOLID",
    loginBackgroundUrl: row.loginBackgroundUrl,
    loginBackgroundPosition: (row.loginBackgroundPosition as ThemeValues["loginBackgroundPosition"]) ?? "CENTER",
    loginBackgroundSize: (row.loginBackgroundSize as ThemeValues["loginBackgroundSize"]) ?? "COVER",
    loginOverlayEnabled: row.loginOverlayEnabled,
    loginOverlayColor: row.loginOverlayColor,
    loginOverlayOpacity: row.loginOverlayOpacity,

    primaryColor: row.primaryColor,
    onPrimaryColor: row.onPrimaryColor,
    secondaryColor: row.secondaryColor,
    onSecondaryColor: row.onSecondaryColor,
    backgroundColor: row.backgroundColor,
    surfaceColor: row.surfaceColor,
    cardColor: row.cardColor,
    textPrimaryColor: row.textPrimaryColor,
    textSecondaryColor: row.textSecondaryColor,
    successColor: row.successColor,
    warningColor: row.warningColor,
    errorColor: row.errorColor,
    infoColor: row.infoColor,
    borderColor: row.borderColor,

    fontFamily: (row.fontFamily as FontKey) in FONT_OPTIONS ? (row.fontFamily as FontKey) : "inter",
    headingFontFamily:
      (row.headingFontFamily as FontKey) in FONT_OPTIONS ? (row.headingFontFamily as FontKey) : "jakarta",
    baseFontSize: row.baseFontSize,
    borderRadiusPreset:
      (row.borderRadiusPreset as RadiusPresetKey) in RADIUS_PRESETS
        ? (row.borderRadiusPreset as RadiusPresetKey)
        : "standard",
    themeMode: "LIGHT",
  };
}

/** The currently live theme, cached per-request. Falls back to DEFAULT_THEME
 * if the DB has no published row or is unreachable — the app must never
 * render an unusable blank/unstyled page because of a theme-layer failure. */
export const getPublishedTheme = cache(async function getPublishedTheme(): Promise<ThemeValues> {
  try {
    const row = await prisma.themeConfig.findFirst({ where: { status: "PUBLISHED" } });
    return row ? toThemeValues(row) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
});

export async function getPublishedThemeRow() {
  return prisma.themeConfig.findFirst({ where: { status: "PUBLISHED" } });
}

export async function getDraftThemeRow() {
  return prisma.themeConfig.findFirst({ where: { status: "DRAFT" } });
}

export async function getArchivedThemeRows() {
  return prisma.themeConfig.findMany({
    where: { status: "ARCHIVED" },
    orderBy: { version: "desc" },
    include: { publishedByUser: { select: { email: true } } },
  });
}

/** Ensures a DRAFT row exists (creating one by cloning the published theme
 * if needed) and returns it. Called when the admin opens the theme editor. */
export async function getOrCreateDraft(actorUserId: string) {
  const existing = await getDraftThemeRow();
  if (existing) return existing;

  const published = await getPublishedThemeRow();
  const base = published ? toThemeValues(published) : DEFAULT_THEME;
  const maxVersion = await prisma.themeConfig.aggregate({ _max: { version: true } });

  return prisma.themeConfig.create({
    data: {
      ...base,
      version: (maxVersion._max.version ?? 0) + 1,
      status: "DRAFT",
      createdBy: actorUserId,
    },
  });
}

/** Strips characters/patterns that could carry markup or script intent out
 * of admin free-text fields before persisting. React already escapes output
 * on render, but this stops obviously hostile content from ever being
 * stored, per the feature's explicit anti-injection requirement. */
export function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .trim()
    .slice(0, 200);
}

// --- Accessibility (WCAG contrast) -----------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_MIN = 4.5;
const UNUSABLE_MIN = 2.0;

export type AccessibilityCheck = { warnings: string[]; blocking: string[] };

/** Checks the pairs that matter for readability (body text, primary/secondary
 * buttons, error text). Ratios below UNUSABLE_MIN are blocking (never allowed
 * to publish); ratios between UNUSABLE_MIN and AA_MIN are AA-fail but usable,
 * so they're a warning only. */
export function checkAccessibility(theme: ThemeValues): AccessibilityCheck {
  const pairs: Array<[string, string, string]> = [
    ["Body text vs background", theme.textPrimaryColor, theme.backgroundColor],
    ["Primary button text vs background", theme.onPrimaryColor, theme.primaryColor],
    ["Secondary button text vs background", theme.onSecondaryColor, theme.secondaryColor],
    ["Error text vs error background", theme.onPrimaryColor, theme.errorColor],
  ];

  const warnings: string[] = [];
  const blocking: string[] = [];
  for (const [label, fg, bg] of pairs) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < UNUSABLE_MIN) {
      blocking.push(`${label}: contrast ratio ${ratio.toFixed(2)} is unreadable (minimum ${UNUSABLE_MIN}).`);
    } else if (ratio < AA_MIN) {
      warnings.push(`${label}: contrast ratio ${ratio.toFixed(2)} is below the recommended ${AA_MIN} (WCAG AA).`);
    }
  }
  return { warnings, blocking };
}

/** Builds the inline <style> body that overrides globals.css's :root vars
 * with the published/draft theme's values, plus radius tokens. */
export function buildThemeCss(theme: ThemeValues): string {
  const radius = RADIUS_PRESETS[theme.borderRadiusPreset];
  return `:root{
  --color-primary:${theme.primaryColor};
  --color-on-primary:${theme.onPrimaryColor};
  --color-secondary:${theme.secondaryColor};
  --color-on-secondary:${theme.onSecondaryColor};
  --color-surface:${theme.backgroundColor};
  --color-surface-container:${theme.surfaceColor};
  --color-surface-container-lowest:${theme.cardColor};
  --color-on-surface:${theme.textPrimaryColor};
  --color-on-surface-variant:${theme.textSecondaryColor};
  --color-secondary-container:${theme.successColor};
  --color-tertiary-container:${theme.warningColor};
  --color-error:${theme.errorColor};
  --color-outline-variant:${theme.borderColor};
  --background:${theme.backgroundColor};
  --foreground:${theme.textPrimaryColor};
  --radius-button:${radius.button};
  --radius-card:${radius.card};
  --radius-input:${radius.input};
  font-size:${theme.baseFontSize}px;
}`;
}
