import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ReferralsTable } from "./ReferralsTable";
import { AdminPageHeader } from "@/components/AdminPageHeader";

export default async function AdminReferrersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const referrals = await prisma.referral.findMany({
    where: { status: "ACTIVE" },
    include: {
      referrer: { select: { email: true } },
      referred: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <AdminPageHeader title="Referral Management" />
      <section className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-6 shadow-sm">
        <h2 className="font-heading text-lg font-semibold text-primary">Active Referral Relationships</h2>
        <p className="text-xs text-on-surface-variant">
          Cancelling stops future commission accrual only — already-accrued or approved commission is never
          reversed.
        </p>

        <ReferralsTable
          referrals={referrals.map((r) => ({
            id: r.id,
            referrerEmail: r.referrer.email,
            referredEmail: r.referred.email,
            expiryDate: r.expiryDate.toLocaleDateString(),
          }))}
        />
      </section>
    </>
  );
}
