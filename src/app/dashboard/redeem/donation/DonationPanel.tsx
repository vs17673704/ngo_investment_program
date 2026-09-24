import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getAvailableMargin } from "@/lib/redemption-engine";
import { prisma } from "@/lib/prisma";
import { formatINR } from "@/lib/format";
import DonationForm from "./DonationForm";

export async function DonationPanel() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [availableMargin, recipients] = await Promise.all([
    getAvailableMargin(session.sub),
    prisma.donationRecipient.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-on-surface-variant">
        Available Margin: <span className="font-semibold text-primary">{formatINR(availableMargin)}</span>
      </p>
      <DonationForm recipients={recipients.map((r) => ({ id: r.id, name: r.name }))} />
    </div>
  );
}
