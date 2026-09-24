"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  DEFAULT_THEME,
  HEX_COLOR_RE,
  TEXT_FIELDS,
  FONT_OPTIONS,
  RADIUS_PRESETS,
  BACKGROUND_TYPES,
  BACKGROUND_POSITIONS,
  BACKGROUND_SIZES,
  sanitizeText,
  checkAccessibility,
  getOrCreateDraft,
  getDraftThemeRow,
} from "@/lib/theme";
async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

const hexSchema = z.string().regex(HEX_COLOR_RE, "Must be a hex color like #1a2b3c");

const draftSchema = z.object({
  appName: z.string().trim().max(200).optional(),
  loginTitle: z.string().trim().max(200).optional(),
  loginSubtitle: z.string().trim().max(200).optional(),
  welcomeText: z.string().trim().max(200).optional(),
  primaryButtonLabel: z.string().trim().max(200).optional(),
  supportText: z.string().trim().max(200).optional(),
  footerText: z.string().trim().max(200).optional(),

  loginBackgroundType: z.enum(BACKGROUND_TYPES),
  loginBackgroundPosition: z.enum(BACKGROUND_POSITIONS),
  loginBackgroundSize: z.enum(BACKGROUND_SIZES),
  loginOverlayEnabled: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "on"),
  loginOverlayColor: hexSchema,
  loginOverlayOpacity: z.coerce.number().int().min(0).max(100),

  primaryColor: hexSchema,
  onPrimaryColor: hexSchema,
  secondaryColor: hexSchema,
  onSecondaryColor: hexSchema,
  backgroundColor: hexSchema,
  surfaceColor: hexSchema,
  cardColor: hexSchema,
  textPrimaryColor: hexSchema,
  textSecondaryColor: hexSchema,
  successColor: hexSchema,
  warningColor: hexSchema,
  errorColor: hexSchema,
  infoColor: hexSchema,
  borderColor: hexSchema,

  fontFamily: z.enum(Object.keys(FONT_OPTIONS) as [string, ...string[]]),
  headingFontFamily: z.enum(Object.keys(FONT_OPTIONS) as [string, ...string[]]),
  baseFontSize: z.coerce.number().int().min(14).max(18),
  borderRadiusPreset: z.enum(Object.keys(RADIUS_PRESETS) as [string, ...string[]]),
});

export type ThemeFormState = { error?: string; success?: boolean; warnings?: string[] } | undefined;

export async function saveDraftAction(_prev: ThemeFormState, formData: FormData): Promise<ThemeFormState> {
  const session = await requireAdmin();

  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(draftSchema.shape)) {
    const value = formData.get(key);
    if (value !== null) raw[key] = value;
  }

  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const draft = await getOrCreateDraft(session.sub);

  const textUpdates: Record<string, string | null> = {};
  for (const field of TEXT_FIELDS) {
    const value = data[field as keyof typeof data];
    textUpdates[field] = typeof value === "string" && value.length > 0 ? sanitizeText(value) : null;
  }

  await prisma.themeConfig.update({
    where: { id: draft.id },
    data: {
      ...textUpdates,
      loginBackgroundType: data.loginBackgroundType,
      loginBackgroundPosition: data.loginBackgroundPosition,
      loginBackgroundSize: data.loginBackgroundSize,
      loginOverlayEnabled: data.loginOverlayEnabled,
      loginOverlayColor: data.loginOverlayColor,
      loginOverlayOpacity: data.loginOverlayOpacity,
      primaryColor: data.primaryColor,
      onPrimaryColor: data.onPrimaryColor,
      secondaryColor: data.secondaryColor,
      onSecondaryColor: data.onSecondaryColor,
      backgroundColor: data.backgroundColor,
      surfaceColor: data.surfaceColor,
      cardColor: data.cardColor,
      textPrimaryColor: data.textPrimaryColor,
      textSecondaryColor: data.textSecondaryColor,
      successColor: data.successColor,
      warningColor: data.warningColor,
      errorColor: data.errorColor,
      infoColor: data.infoColor,
      borderColor: data.borderColor,
      fontFamily: data.fontFamily,
      headingFontFamily: data.headingFontFamily,
      baseFontSize: data.baseFontSize,
      borderRadiusPreset: data.borderRadiusPreset,
    },
  });

  await logAudit({ actorUserId: session.sub, eventType: "THEME_DRAFT_SAVED", entityRef: draft.id });
  revalidatePath("/admin/theme");

  const { warnings } = checkAccessibility({ ...DEFAULT_THEME, ...data } as never);
  return { success: true, warnings: warnings.length > 0 ? warnings : undefined };
}

export type PublishState = { error?: string; success?: boolean } | undefined;

export async function publishAction(): Promise<PublishState> {
  const session = await requireAdmin();

  const draft = await getDraftThemeRow();
  if (!draft) return { error: "No draft to publish." };

  const { blocking } = checkAccessibility({
    ...DEFAULT_THEME,
    primaryColor: draft.primaryColor,
    onPrimaryColor: draft.onPrimaryColor,
    secondaryColor: draft.secondaryColor,
    onSecondaryColor: draft.onSecondaryColor,
    backgroundColor: draft.backgroundColor,
    textPrimaryColor: draft.textPrimaryColor,
    errorColor: draft.errorColor,
  } as never);
  if (blocking.length > 0) {
    return { error: `Cannot publish: ${blocking[0]}` };
  }

  const maxVersion = await prisma.themeConfig.aggregate({ _max: { version: true } });
  const nextVersion = (maxVersion._max.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.themeConfig.updateMany({ where: { status: "PUBLISHED" }, data: { status: "ARCHIVED" } });
    await tx.themeConfig.update({
      where: { id: draft.id },
      data: {
        status: "PUBLISHED",
        version: nextVersion,
        publishedAt: new Date(),
        publishedBy: session.sub,
      },
    });
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "THEME_PUBLISHED",
    entityRef: draft.id,
    details: { version: nextVersion },
  });
  revalidatePath("/", "layout");
  revalidatePath("/admin/theme");
  return { success: true };
}

export async function rollbackAction(targetId: string): Promise<PublishState> {
  const session = await requireAdmin();

  const target = await prisma.themeConfig.findUnique({ where: { id: targetId } });
  if (!target || target.status !== "ARCHIVED") return { error: "That version is not available to roll back to." };

  const maxVersion = await prisma.themeConfig.aggregate({ _max: { version: true } });
  const nextVersion = (maxVersion._max.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.themeConfig.updateMany({ where: { status: "PUBLISHED" }, data: { status: "ARCHIVED" } });
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = target;
    void _id;
    void _createdAt;
    void _updatedAt;
    await tx.themeConfig.create({
      data: {
        ...rest,
        status: "PUBLISHED",
        version: nextVersion,
        createdBy: session.sub,
        publishedBy: session.sub,
        publishedAt: new Date(),
      },
    });
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "THEME_ROLLED_BACK",
    details: { fromVersion: target.version, newVersion: nextVersion },
  });
  revalidatePath("/", "layout");
  revalidatePath("/admin/theme");
  return { success: true };
}

export async function resetAction(): Promise<PublishState> {
  const session = await requireAdmin();

  const maxVersion = await prisma.themeConfig.aggregate({ _max: { version: true } });
  const nextVersion = (maxVersion._max.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.themeConfig.updateMany({ where: { status: "PUBLISHED" }, data: { status: "ARCHIVED" } });
    await tx.themeConfig.create({
      data: {
        ...DEFAULT_THEME,
        status: "PUBLISHED",
        version: nextVersion,
        createdBy: session.sub,
        publishedBy: session.sub,
        publishedAt: new Date(),
      },
    });
  });

  await logAudit({ actorUserId: session.sub, eventType: "THEME_RESET", details: { newVersion: nextVersion } });
  revalidatePath("/", "layout");
  revalidatePath("/admin/theme");
  return { success: true };
}
