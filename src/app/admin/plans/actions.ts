"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { dedupeCadences, parseCadenceKey, type Cadence } from "@/lib/range-generator";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

const createPlanSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  tenureMonths: z.coerce.number().int().min(1).max(600),
  paymentFrequency: z.enum(["MONTHLY", "LUMPSUM"]),
  presetAmounts: z
    .string()
    .trim()
    .min(1, "Enter at least one preset amount")
    .transform((s, ctx) => {
      const values = s.split(",").map((v) => Number(v.trim()));
      if (values.some((v) => !Number.isFinite(v) || v <= 0)) {
        ctx.addIssue({ code: "custom", message: "Preset amounts must be positive numbers" });
        return z.NEVER;
      }
      return values;
    }),
  interestMethodId: z.string().trim().min(1, "Select an interest method"),
  rewardPercent: z.coerce.number().min(0).max(100).optional(),
  commissionPercent: z.coerce.number().min(0).max(100),
});

export type PlanFormState = { error?: string } | undefined;

export async function createPlanAction(
  _prev: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  const session = await requireAdmin();

  const parsed = createPlanSchema.safeParse({
    name: formData.get("name"),
    tenureMonths: formData.get("tenureMonths"),
    paymentFrequency: formData.get("paymentFrequency"),
    presetAmounts: formData.get("presetAmounts"),
    interestMethodId: formData.get("interestMethodId"),
    rewardPercent: formData.get("rewardPercent") || undefined,
    commissionPercent: formData.get("commissionPercent"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const plan = await prisma.plan.create({
    data: {
      name: data.name,
      tenureMonths: data.tenureMonths,
      paymentFrequency: data.paymentFrequency,
      presetAmounts: data.presetAmounts,
      interestMethodId: data.interestMethodId,
      rewardPercent: data.rewardPercent,
      commissionPercent: data.commissionPercent,
    },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "PLAN_CREATED",
    entityRef: plan.id,
  });
  revalidatePath("/admin/plans");
}

// BRD Rule XLVII: admin-editable preset amount list on an existing plan.
// Changing this list only affects new subscriptions (Rule XVI) — an existing
// UserPlan's paymentAmount is already snapshotted at subscribe time.
export type PlanAmountsFormState = { error?: string } | undefined;

const updateAmountsSchema = z.object({
  planId: z.string().trim().min(1),
  mode: z.enum(["add", "replace"]),
  amounts: z
    .string()
    .trim()
    .min(1, "Enter at least one amount")
    .transform((s, ctx) => {
      const parsed = s
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .map((v) => Number(v));
      if (parsed.length === 0 || parsed.some((v) => !Number.isFinite(v) || v <= 0)) {
        ctx.addIssue({ code: "custom", message: "Amounts must be positive numbers" });
        return z.NEVER;
      }
      return parsed;
    }),
});

export async function updatePlanAmountsAction(
  _prev: PlanAmountsFormState,
  formData: FormData,
): Promise<PlanAmountsFormState> {
  const session = await requireAdmin();

  const parsed = updateAmountsSchema.safeParse({
    planId: formData.get("planId"),
    mode: formData.get("mode"),
    amounts: formData.get("amounts"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { planId, mode, amounts } = parsed.data;

  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  const existing = plan.presetAmounts.map((a) => Number(a));
  const next =
    mode === "replace"
      ? Array.from(new Set(amounts)).sort((a, b) => a - b)
      : Array.from(new Set([...existing, ...amounts])).sort((a, b) => a - b);

  await prisma.plan.update({
    where: { id: planId },
    data: { presetAmounts: next, configVersion: { increment: 1 } },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "PLAN_AMOUNTS_UPDATED",
    entityRef: planId,
  });
  revalidatePath("/admin/plans");
}

// BRD Rule XLVIII: admin-managed payment duration/cadence list on an existing
// plan. Changing this list only affects new subscriptions (Rule XVI) — an
// existing UserPlan's cadenceUnit/cadenceInterval is already snapshotted at
// subscribe time.
export type PlanCadencesFormState = { error?: string } | undefined;

const updateCadencesSchema = z.object({
  planId: z.string().trim().min(1),
  mode: z.enum(["add", "replace"]),
  cadences: z
    .string()
    .trim()
    .min(1, "Enter at least one payment duration")
    .transform((s, ctx) => {
      const keys = s
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      const parsedCadences = keys.map((k) => parseCadenceKey(k));
      if (parsedCadences.length === 0 || parsedCadences.some((c) => c === null)) {
        ctx.addIssue({ code: "custom", message: "Invalid payment duration" });
        return z.NEVER;
      }
      return parsedCadences as Cadence[];
    }),
});

export async function updatePlanCadencesAction(
  _prev: PlanCadencesFormState,
  formData: FormData,
): Promise<PlanCadencesFormState> {
  const session = await requireAdmin();

  const parsed = updateCadencesSchema.safeParse({
    planId: formData.get("planId"),
    mode: formData.get("mode"),
    cadences: formData.get("cadences"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { planId, mode, cadences } = parsed.data;

  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  const existing = (plan.paymentCadences as unknown as Cadence[]) ?? [];
  const next =
    mode === "replace"
      ? dedupeCadences(cadences)
      : dedupeCadences([...existing, ...cadences]);

  await prisma.plan.update({
    where: { id: planId },
    data: { paymentCadences: next, configVersion: { increment: 1 } },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "PLAN_CADENCES_UPDATED",
    entityRef: planId,
  });
  revalidatePath("/admin/plans");
}

// BRD Interest Calculation Method rule (d): re-pointing an existing Plan at a
// different (active) method only changes what future subscriptions read —
// src/app/plans/[planId]/actions.ts copies interestMethodId/version onto the
// UserPlan at subscribe time, so already-enrolled UserPlans are untouched.
export type ReassignInterestMethodFormState = { error?: string } | undefined;

const reassignInterestMethodSchema = z.object({
  planId: z.string().trim().min(1),
  interestMethodId: z.string().trim().min(1, "Select an interest method"),
});

export async function reassignPlanInterestMethodAction(
  _prev: ReassignInterestMethodFormState,
  formData: FormData,
): Promise<ReassignInterestMethodFormState> {
  const session = await requireAdmin();

  const parsed = reassignInterestMethodSchema.safeParse({
    planId: formData.get("planId"),
    interestMethodId: formData.get("interestMethodId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { planId, interestMethodId } = parsed.data;

  const method = await prisma.interestCalculationMethod.findUnique({ where: { id: interestMethodId } });
  if (!method || !method.active) {
    return { error: "Selected interest method is not available" };
  }

  await prisma.plan.update({
    where: { id: planId },
    data: { interestMethodId, configVersion: { increment: 1 } },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "PLAN_INTEREST_METHOD_REASSIGNED",
    entityRef: planId,
    details: { interestMethodId },
  });
  revalidatePath("/admin/plans");
}

export async function togglePlanStatusAction(planId: string): Promise<void> {
  const session = await requireAdmin();
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  const nextStatus = plan.status === "ACTIVE" ? "DISCONTINUED" : "ACTIVE";

  await prisma.$transaction([
    prisma.plan.update({
      where: { id: planId },
      data: { status: nextStatus, configVersion: { increment: 1 } },
    }),
    // BRD Rule III: discontinuing a Plan moves existing enrolled users' own
    // UserPlan records to DISCONTINUED too (they are honored to maturity
    // unchanged, per plan terms — only new enrolment is blocked). Reactivating
    // the Plan reverses only the UserPlans this cascade previously moved,
    // never touching MATURED/PARTIALLY_REDEEMED/REDEEMED plans.
    prisma.userPlan.updateMany({
      where: { planId, status: nextStatus === "DISCONTINUED" ? "ACTIVE" : "DISCONTINUED" },
      data: { status: nextStatus },
    }),
  ]);

  await logAudit({
    actorUserId: session.sub,
    eventType: nextStatus === "ACTIVE" ? "PLAN_REACTIVATED" : "PLAN_DISCONTINUED",
    entityRef: planId,
  });
  revalidatePath("/admin/plans");
}
