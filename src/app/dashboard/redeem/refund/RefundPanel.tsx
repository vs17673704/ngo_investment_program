import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getAvailableMargin } from "@/lib/redemption-engine";
import { formatINR } from "@/lib/format";
import AmountRedeemForm from "../AmountRedeemForm";

export async function RefundPanel() {
  const session = await getSession();
  if (!session) redirect("/login");
  const availableMargin = await getAvailableMargin(session.sub);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-on-surface-variant">
        Available Margin: <span className="font-semibold text-primary">{formatINR(availableMargin)}</span>
      </p>
      <AmountRedeemForm category="REFUND" />
    </div>
  );
}
