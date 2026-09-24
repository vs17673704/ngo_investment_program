"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { aboutUsSectionSchema, MAX_ABOUT_US_SECTIONS } from "@/lib/validation/about-us";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

export type AboutUsActionState = { error?: string } | undefined;

// Design.md 5.13.C: repeatable section list, max 20 sections server-side,
// heading-only (empty body) is invalid.
export async function addAboutUsSectionAction(
  _prev: AboutUsActionState,
  formData: FormData,
): Promise<AboutUsActionState> {
  const session = await requireAdmin();

  const count = await prisma.aboutUsSectionDraft.count();
  if (count >= MAX_ABOUT_US_SECTIONS) {
    return { error: `Maximum of ${MAX_ABOUT_US_SECTIONS} sections reached.` };
  }

  const parsed = aboutUsSectionSchema.safeParse({
    heading: formData.get("heading") || undefined,
    body: formData.get("body") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const last = await prisma.aboutUsSectionDraft.findFirst({ orderBy: { order: "desc" } });
  await prisma.aboutUsSectionDraft.create({
    data: {
      heading: parsed.data.heading || null,
      body: parsed.data.body,
      order: last ? last.order + 1 : 0,
    },
  });

  await logAudit({ actorUserId: session.sub, eventType: "ABOUT_US_SECTION_ADDED" });

  revalidatePath("/admin/settings/about-us");
}

export async function updateAboutUsSectionAction(
  _prev: AboutUsActionState,
  formData: FormData,
): Promise<AboutUsActionState> {
  const session = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const parsed = aboutUsSectionSchema.safeParse({
    heading: formData.get("heading") || undefined,
    body: formData.get("body") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await prisma.aboutUsSectionDraft.update({
    where: { id },
    data: { heading: parsed.data.heading || null, body: parsed.data.body },
  });

  await logAudit({ actorUserId: session.sub, eventType: "ABOUT_US_SECTION_UPDATED", entityRef: id });

  revalidatePath("/admin/settings/about-us");
}

// Design.md 5.13.C: delete requires confirmation (enforced client-side) and
// is audit logged.
export async function removeAboutUsSectionAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  await prisma.aboutUsSectionDraft.delete({ where: { id } });

  await logAudit({ actorUserId: session.sub, eventType: "ABOUT_US_SECTION_REMOVED", entityRef: id });

  revalidatePath("/admin/settings/about-us");
}

export async function moveAboutUsSectionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const sections = await prisma.aboutUsSectionDraft.findMany({ orderBy: { order: "asc" } });
  const index = sections.findIndex((s) => s.id === id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= sections.length) return;

  const current = sections[index];
  const swap = sections[swapIndex];
  await prisma.$transaction([
    prisma.aboutUsSectionDraft.update({ where: { id: current.id }, data: { order: swap.order } }),
    prisma.aboutUsSectionDraft.update({ where: { id: swap.id }, data: { order: current.order } }),
  ]);

  revalidatePath("/admin/settings/about-us");
}

// Design.md 5.13.E: Publish replaces the active public version atomically —
// every AboutUsSectionPublished row is replaced with a snapshot of the
// current AboutUsSectionDraft rows.
export async function publishAboutUsAction(
  _prev: AboutUsActionState,
  _formData: FormData,
): Promise<AboutUsActionState> {
  const session = await requireAdmin();

  const draftSections = await prisma.aboutUsSectionDraft.findMany({ orderBy: { order: "asc" } });

  await prisma.$transaction([
    prisma.aboutUsSectionPublished.deleteMany({}),
    ...(draftSections.length > 0
      ? [
          prisma.aboutUsSectionPublished.createMany({
            data: draftSections.map((s) => ({ heading: s.heading, body: s.body, order: s.order })),
          }),
        ]
      : []),
  ]);

  await logAudit({ actorUserId: session.sub, eventType: "ABOUT_US_PUBLISHED" });

  revalidatePath("/admin/settings/about-us");
  revalidatePath("/about");
  revalidatePath("/");
  return undefined;
}
