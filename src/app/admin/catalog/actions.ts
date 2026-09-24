"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

export type FormState = { error?: string } | undefined;

const nameSchema = z.string().trim().min(1, "Name is required");

export async function createUniversityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const university = await prisma.university.create({ data: { name: parsed.data } });
  await logAudit({ actorUserId: session.sub, eventType: "UNIVERSITY_CREATED", entityRef: university.id });
  revalidatePath("/admin/catalog/universities-courses");
}

const courseSchema = z.object({
  universityId: z.string().trim().min(1, "Select a university"),
  name: z.string().trim().min(1, "Course name is required"),
  fee: z.coerce.number().positive("Fee must be positive"),
});

export async function createCourseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = courseSchema.safeParse({
    universityId: formData.get("universityId"),
    name: formData.get("name"),
    fee: formData.get("fee"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const course = await prisma.course.create({ data: parsed.data });
  await logAudit({ actorUserId: session.sub, eventType: "COURSE_CREATED", entityRef: course.id });
  revalidatePath("/admin/catalog/universities-courses");
}

export async function createDonationRecipientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const recipient = await prisma.donationRecipient.create({ data: { name: parsed.data } });
  await logAudit({ actorUserId: session.sub, eventType: "DONATION_RECIPIENT_CREATED", entityRef: recipient.id });
  revalidatePath("/admin/catalog/donation-recipients");
}

export async function setDonationRecipientActiveAction(
  recipientId: string,
  active: boolean,
): Promise<void> {
  const session = await requireAdmin();
  await prisma.donationRecipient.update({ where: { id: recipientId }, data: { active } });
  await logAudit({
    actorUserId: session.sub,
    eventType: active ? "DONATION_RECIPIENT_ACTIVATED" : "DONATION_RECIPIENT_DEACTIVATED",
    entityRef: recipientId,
  });
  revalidatePath("/admin/catalog/donation-recipients");
}

const gadgetSchema = z.object({
  category: z.string().trim().min(1, "Category is required"),
  name: z.string().trim().min(1, "Name is required"),
  price: z.coerce.number().positive("Price must be positive"),
  stockQuantity: z.coerce.number().int().min(0, "Stock must be 0 or more"),
});

export async function createGadgetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = gadgetSchema.safeParse({
    category: formData.get("category"),
    name: formData.get("name"),
    price: formData.get("price"),
    stockQuantity: formData.get("stockQuantity"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const gadget = await prisma.gadgetItem.create({ data: parsed.data });
  await logAudit({ actorUserId: session.sub, eventType: "GADGET_CREATED", entityRef: gadget.id });
  revalidatePath("/admin/catalog/gadgets");
}

export async function adjustGadgetStockAction(
  gadgetId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const delta = Number(formData.get("delta"));
  if (!Number.isFinite(delta) || delta === 0) {
    return { error: "Enter a non-zero quantity" };
  }

  const gadget = await prisma.gadgetItem.findUniqueOrThrow({ where: { id: gadgetId } });
  const nextStock = Number(gadget.stockQuantity) + delta;
  if (nextStock < gadget.reservedQuantity) {
    return { error: "Stock cannot fall below currently reserved quantity" };
  }

  await prisma.gadgetItem.update({ where: { id: gadgetId }, data: { stockQuantity: nextStock } });
  await logAudit({
    actorUserId: session.sub,
    eventType: "GADGET_STOCK_ADJUSTED",
    entityRef: gadgetId,
    details: { delta, nextStock },
  });
  revalidatePath("/admin/catalog/gadgets");
  return {};
}

export async function createCollegeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const college = await prisma.college.create({ data: { name: parsed.data } });
  await logAudit({ actorUserId: session.sub, eventType: "COLLEGE_CREATED", entityRef: college.id });
  revalidatePath("/admin/catalog/colleges");
  revalidatePath("/admin/catalog/franchisee-plans");
}

const franchiseePlanSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  oneTimeDeductiblePrice: z.coerce.number().positive("Price must be positive"),
});

export async function createFranchiseePlanAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = franchiseePlanSchema.safeParse({
    name: formData.get("name"),
    oneTimeDeductiblePrice: formData.get("oneTimeDeductiblePrice"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const plan = await prisma.franchiseePlan.create({ data: parsed.data });
  await logAudit({ actorUserId: session.sub, eventType: "FRANCHISEE_PLAN_CREATED", entityRef: plan.id });
  revalidatePath("/admin/catalog/franchisee-plans");
}

export async function toggleFranchiseeMappingAction(
  franchiseePlanId: string,
  collegeId: string,
): Promise<void> {
  const session = await requireAdmin();
  const existing = await prisma.franchiseePlanCollegeMapping.findUnique({
    where: { franchiseePlanId_collegeId: { franchiseePlanId, collegeId } },
  });

  if (existing) {
    await prisma.franchiseePlanCollegeMapping.delete({
      where: { franchiseePlanId_collegeId: { franchiseePlanId, collegeId } },
    });
  } else {
    await prisma.franchiseePlanCollegeMapping.create({ data: { franchiseePlanId, collegeId } });
  }

  await logAudit({
    actorUserId: session.sub,
    eventType: existing ? "FRANCHISEE_MAPPING_REMOVED" : "FRANCHISEE_MAPPING_ADDED",
    entityRef: `${franchiseePlanId}:${collegeId}`,
  });
  revalidatePath("/admin/catalog/franchisee-plans");
}
