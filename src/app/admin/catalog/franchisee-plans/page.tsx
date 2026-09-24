import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CreateFranchiseePlanDialog } from "./FranchiseePlanDialogs";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { FranchiseePlansList } from "./FranchiseePlansList";

export default async function AdminFranchiseePlansPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [colleges, franchiseePlans] = await Promise.all([
    prisma.college.findMany({ orderBy: { name: "asc" } }),
    prisma.franchiseePlan.findMany({
      include: { collegeMappings: { include: { college: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <AdminPageHeader title="Franchisee Plans & College Mappings" />
      <section className="flex flex-wrap gap-3">
        <CreateFranchiseePlanDialog />
      </section>
      <section className="flex flex-col gap-3">
        <FranchiseePlansList
          colleges={colleges.map((c) => ({ id: c.id, name: c.name }))}
          franchiseePlans={franchiseePlans.map((fp) => ({
            id: fp.id,
            name: fp.name,
            oneTimeDeductiblePrice: Number(fp.oneTimeDeductiblePrice).toFixed(2),
            mappedCollegeIds: fp.collegeMappings.map((m) => m.collegeId),
          }))}
        />
      </section>
    </>
  );
}
