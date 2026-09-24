import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AccruedCommissionsList, ApprovedCommissionsList } from "./CommissionsLists";

export default async function AdminCommissionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [accrued, approved] = await Promise.all([
    prisma.commission.findMany({
      where: { status: "ACCRUED" },
      include: { referral: { include: { referrer: true, referred: true } } },
      orderBy: { accrualDate: "asc" },
    }),
    prisma.commission.findMany({
      where: { status: "APPROVED" },
      include: { referral: { include: { referrer: true, referred: true } } },
      orderBy: { approvalDate: "asc" },
    }),
  ]);

  const toRow = (c: (typeof accrued)[number]) => ({
    id: c.id,
    amount: Number(c.amount).toFixed(2),
    commissionType: c.commissionType,
    cyclePosition: c.cyclePosition,
    referrerEmail: c.referral.referrer.email,
    referredEmail: c.referral.referred.email,
  });

  return (
    <>
      <AdminPageHeader title="Commission Lifecycle" />
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-primary">Pending approval (ACCRUED)</h2>
        <AccruedCommissionsList commissions={accrued.map(toRow)} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-primary">Approved — ready to credit (APPROVED)</h2>
        <p className="text-xs text-on-surface-variant">
          Non-reversible: once approved, a commission can no longer be rejected. Crediting posts it to the
          referrer&apos;s unified ledger and makes it available for withdrawal.
        </p>
        <ApprovedCommissionsList commissions={approved.map(toRow)} />
      </section>
    </>
  );
}
