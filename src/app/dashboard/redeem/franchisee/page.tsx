import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getAvailableMargin } from "@/lib/redemption-engine";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";
import { FranchiseeEnquiryList } from "./FranchiseeEnquiryList";

export default async function FranchiseeRedeemPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [plans, availableMargin] = await Promise.all([
    prisma.franchiseePlan.findMany({
      include: { collegeMappings: { include: { college: true } } },
    }),
    getAvailableMargin(session.sub),
  ]);

  return (
    <>
      <div className="flex w-full flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Franchisee Enquiry</h1>
        <p className="text-sm text-on-surface-variant">
          Available Margin: <span className="font-semibold text-primary">{formatINR(availableMargin)}</span>
        </p>

        {plans.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
            <Icon name="storefront" className="text-[32px] text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">No franchisee plans available yet.</p>
          </div>
        ) : (
          <FranchiseeEnquiryList
            plans={plans.map((plan) => ({
              id: plan.id,
              name: plan.name,
              oneTimeDeductiblePrice: plan.oneTimeDeductiblePrice.toString(),
              colleges: plan.collegeMappings.map((m) => m.college),
            }))}
            availableMargin={availableMargin}
          />
        )}
      </div>
    </>
  );
}
