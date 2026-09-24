"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { validateCustomFormula, InvalidFormulaError } from "@/lib/interest-engine";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

// Design.md 5.4: custom formula is limited to Principal/Rate/Tenure/ElapsedDays
// and + - * / (), max 100 chars, max nesting depth 5 — all enforced inside
// validateCustomFormula (src/lib/interest-engine.ts), which also rejects
// divide-by-zero, NaN/Infinity, and negative results using representative
// sample inputs.
const createInterestMethodSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    formulaType: z.enum(["SIMPLE", "COMPOUND", "CUSTOM"]),
    ratePercent: z.coerce.number().min(0).max(100),
    tenureMonths: z.coerce.number().int().min(1).max(600),
    compoundingFrequency: z.string().trim().optional(),
    customFormula: z.string().trim().optional(),
    dayCountBasis: z.enum(["ACTUAL_365", "ACTUAL_360"]),
  })
  .superRefine((data, ctx) => {
    if (data.formulaType === "COMPOUND" && !data.compoundingFrequency) {
      ctx.addIssue({
        code: "custom",
        path: ["compoundingFrequency"],
        message: "Compounding frequency is required for Compound Interest",
      });
    }
    if (data.formulaType === "CUSTOM") {
      if (!data.customFormula) {
        ctx.addIssue({
          code: "custom",
          path: ["customFormula"],
          message: "Custom formula is required for Custom Parameterized Formula",
        });
      } else {
        try {
          validateCustomFormula(data.customFormula);
        } catch (err) {
          ctx.addIssue({
            code: "custom",
            path: ["customFormula"],
            message: err instanceof InvalidFormulaError ? err.message : "Invalid custom formula",
          });
        }
      }
    }
  });

export type InterestMethodFormState = { error?: string } | undefined;

export async function createInterestMethodAction(
  _prev: InterestMethodFormState,
  formData: FormData,
): Promise<InterestMethodFormState> {
  const session = await requireAdmin();

  const parsed = createInterestMethodSchema.safeParse({
    name: formData.get("name"),
    formulaType: formData.get("formulaType"),
    ratePercent: formData.get("ratePercent"),
    tenureMonths: formData.get("tenureMonths"),
    compoundingFrequency: formData.get("compoundingFrequency") || undefined,
    customFormula: formData.get("customFormula") || undefined,
    dayCountBasis: formData.get("dayCountBasis"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const method = await prisma.interestCalculationMethod.create({
    data: {
      name: data.name,
      formulaType: data.formulaType,
      ratePercent: data.ratePercent,
      tenureMonths: data.tenureMonths,
      compoundingFrequency: data.formulaType === "COMPOUND" ? data.compoundingFrequency : null,
      customFormula: data.formulaType === "CUSTOM" ? data.customFormula : null,
      dayCountBasis: data.dayCountBasis,
    },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "INTEREST_METHOD_CREATED",
    entityRef: method.id,
  });

  // Plan creation's dropdown reads the full method list too.
  revalidatePath("/admin/interest-methods");
  revalidatePath("/admin/plans");
}

const reviseInterestMethodSchema = createInterestMethodSchema.and(
  z.object({ methodId: z.string().trim().min(1, "Method is required") }),
);

// BRD Interest Calculation Method rule (e): a revision never mutates the
// existing row — already-enrolled Plans/UserPlans hold a direct FK to it, and
// runMaturityTransitions() reads that relation live, so mutating in place
// would retroactively change interest for existing enrollments. Instead this
// creates a brand-new row (the next version) and retires the old one.
export async function reviseInterestMethodAction(
  _prev: InterestMethodFormState,
  formData: FormData,
): Promise<InterestMethodFormState> {
  const session = await requireAdmin();

  const parsed = reviseInterestMethodSchema.safeParse({
    methodId: formData.get("methodId"),
    name: formData.get("name"),
    formulaType: formData.get("formulaType"),
    ratePercent: formData.get("ratePercent"),
    tenureMonths: formData.get("tenureMonths"),
    compoundingFrequency: formData.get("compoundingFrequency") || undefined,
    customFormula: formData.get("customFormula") || undefined,
    dayCountBasis: formData.get("dayCountBasis"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.interestCalculationMethod.findUniqueOrThrow({
        where: { id: data.methodId },
      });

      const revised = await tx.interestCalculationMethod.create({
        data: {
          name: data.name,
          formulaType: data.formulaType,
          ratePercent: data.ratePercent,
          tenureMonths: data.tenureMonths,
          compoundingFrequency: data.formulaType === "COMPOUND" ? data.compoundingFrequency : null,
          customFormula: data.formulaType === "CUSTOM" ? data.customFormula : null,
          dayCountBasis: data.dayCountBasis,
          version: current.version + 1,
          previousVersionId: current.id,
        },
      });

      await tx.interestCalculationMethod.update({
        where: { id: current.id },
        data: { active: false },
      });

      await logAudit({
        actorUserId: session.sub,
        eventType: "INTEREST_METHOD_REVISED",
        entityRef: revised.id,
        details: { previousVersionId: current.id },
      });
    });
  } catch {
    return { error: "Interest method not found" };
  }

  revalidatePath("/admin/interest-methods");
  revalidatePath("/admin/plans");
}
