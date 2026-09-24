import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getAvailableMargin } from "@/lib/redemption-engine";
import { prisma } from "@/lib/prisma";
import { formatINR } from "@/lib/format";
import ReinvestmentForm from "./ReinvestmentForm";

export async function ReinvestmentPanel() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [availableMargin, plans] = await Promise.all([
    getAvailableMargin(session.sub),
    prisma.plan.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, tenureMonths: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-on-surface-variant">
        Available Margin: <span className="font-semibold text-primary">{formatINR(availableMargin)}</span>
      </p>
      <p className="text-sm text-on-surface-variant">Select a plan to enrol into once your reinvestment is approved.</p>
      <ReinvestmentForm plans={plans} />
    </div>
  );
}
