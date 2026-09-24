import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CreateInterestMethodDialog } from "./CreateInterestMethodDialog";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { InterestMethodsTable } from "./InterestMethodsTable";

export default async function AdminInterestMethodsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const methods = await prisma.interestCalculationMethod.findMany({
    include: { _count: { select: { plans: true, userPlans: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <AdminPageHeader title="Interest Methods" />
      <section className="flex flex-wrap gap-3">
        <CreateInterestMethodDialog />
      </section>

      <InterestMethodsTable
        methods={methods.map((m) => ({
          id: m.id,
          name: m.name,
          formulaType: m.formulaType,
          compoundingFrequency: m.compoundingFrequency,
          customFormula: m.customFormula,
          ratePercent: Number(m.ratePercent).toFixed(2),
          tenureMonths: m.tenureMonths,
          dayCountBasis: m.dayCountBasis,
          version: m.version,
          active: m.active,
          previousVersionId: m.previousVersionId,
          plansUsing: m._count.plans,
        }))}
      />
    </>
  );
}
