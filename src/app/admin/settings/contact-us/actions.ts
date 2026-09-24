"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { contactUsContentSchema, type SocialLink } from "@/lib/validation/contact-us";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

export type ContactUsActionState = { error?: string } | undefined;

async function getOrCreateSingleton() {
  const existing = await prisma.contactUsContent.findFirst();
  if (existing) return existing;
  return prisma.contactUsContent.create({ data: {} });
}

function parseSocialLinksField(raw: FormDataEntryValue | null): SocialLink[] {
  if (!raw || typeof raw !== "string" || !raw.trim()) return [];
  const links: SocialLink[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [label, url] = trimmed.split("|").map((part) => part.trim());
    if (label && url) links.push({ label, url });
  }
  return links;
}

// Design.md 5.13.D: all fields optional; unconfigured fields are simply
// omitted. Saves to draft* columns only — public page is unaffected until Publish.
export async function saveContactUsDraftAction(
  _prev: ContactUsActionState,
  formData: FormData,
): Promise<ContactUsActionState> {
  const session = await requireAdmin();

  const parsed = contactUsContentSchema.safeParse({
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    website: formData.get("website") || undefined,
    socialLinks: parseSocialLinksField(formData.get("socialLinks")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const singleton = await getOrCreateSingleton();
  await prisma.contactUsContent.update({
    where: { id: singleton.id },
    data: {
      draftAddress: parsed.data.address || null,
      draftPhone: parsed.data.phone || null,
      draftEmail: parsed.data.email || null,
      draftWebsite: parsed.data.website || null,
      draftSocialLinks: parsed.data.socialLinks && parsed.data.socialLinks.length > 0 ? parsed.data.socialLinks : Prisma.JsonNull,
    },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "CONTACT_US_DRAFT_SAVED",
    entityRef: singleton.id,
  });

  revalidatePath("/admin/settings/contact-us");
}

// Design.md 5.13.E: Publish replaces the active public version atomically.
export async function publishContactUsAction(
  _prev: ContactUsActionState,
  _formData: FormData,
): Promise<ContactUsActionState> {
  const session = await requireAdmin();

  const singleton = await getOrCreateSingleton();
  await prisma.contactUsContent.update({
    where: { id: singleton.id },
    data: {
      publishedAddress: singleton.draftAddress,
      publishedPhone: singleton.draftPhone,
      publishedEmail: singleton.draftEmail,
      publishedWebsite: singleton.draftWebsite,
      publishedSocialLinks: singleton.draftSocialLinks === null ? Prisma.JsonNull : singleton.draftSocialLinks,
      publishedAt: new Date(),
    },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "CONTACT_US_PUBLISHED",
    entityRef: singleton.id,
  });

  revalidatePath("/admin/settings/contact-us");
  revalidatePath("/contact");
  revalidatePath("/");
  return undefined;
}
