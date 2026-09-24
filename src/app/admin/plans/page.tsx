import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CreatePlanDialog, ManageAmountsDialog, ManageCadencesDialog } from "./PlanFormDialogs";
import { PlansTable } from "./PlansTable";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import type { Cadence } from "@/lib/range-generator";

export default async function AdminPlansPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [plans, interestMethods] = await Promise.all([
    prisma.plan.findMany({
      include: { interestMethod: true, _count: { select: { userPlans: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.interestCalculationMethod.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <AdminPageHeader title="Plan Management" />
      <section className="flex flex-wrap gap-3">
        <CreatePlanDialog interestMethods={interestMethods.map((m) => ({ id: m.id, name: m.name }))} />

        {plans.length > 0 && (
          <>
            {/* BRD Rule XLVII — editing an existing plan's preset amount list
                only affects new subscriptions (Rule XVI); existing UserPlans
                keep the amount they originally selected. */}
            <ManageAmountsDialog
              plans={plans.map((p) => ({
                id: p.id,
                name: p.name,
                presetAmounts: p.presetAmounts.map((a) => Number(a)),
              }))}
            />

            {/* BRD Rule XLVIII — same "new subscriptions only" scope applies
                to the payment duration/cadence list. */}
            <ManageCadencesDialog
              plans={plans.map((p) => ({
                id: p.id,
                name: p.name,
                paymentCadences: p.paymentCadences as unknown as Cadence[],
              }))}
            />
          </>
        )}
      </section>

      <PlansTable
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          tenureMonths: p.tenureMonths,
          paymentFrequency: p.paymentFrequency,
          interestMethodId: p.interestMethodId,
          interestMethodName: p.interestMethod.name,
          rewardPercent: p.rewardPercent ? Number(p.rewardPercent).toFixed(2) : null,
          commissionPercent: Number(p.commissionPercent).toFixed(2),
          subscriberCount: p._count.userPlans,
          status: p.status,
        }))}
        activeInterestMethods={interestMethods.map((m) => ({ id: m.id, name: m.name }))}
      />
    </>
  );
}
