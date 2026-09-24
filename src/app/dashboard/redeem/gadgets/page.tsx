import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getAvailableMargin } from "@/lib/redemption-engine";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";
import GadgetCartForm from "./GadgetCartForm";

export default async function GadgetsRedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { edit } = await searchParams;

  const [gadgets, availableMargin, editingRequest] = await Promise.all([
    prisma.gadgetItem.findMany({ orderBy: { name: "asc" } }),
    getAvailableMargin(session.sub),
    edit
      ? prisma.redemptionRequest.findFirst({
          where: {
            id: edit,
            userId: session.sub,
            category: "GADGETS",
            status: { in: ["PENDING", "AWAITING_SHORTFALL_RESOLUTION"] },
          },
          include: { gadgetItems: true },
        })
      : Promise.resolve(null),
  ]);

  // Design.md 3.13: while editing a pending request, its own current
  // reservation must not count against Available Margin or against the
  // gadget's own displayed stock — the old reservation is released only when
  // the edit is actually submitted (updateGadgetCartRedemptionRequest), so
  // it is still held in the DB right now and must be added back here.
  const ownReservedByGadget = new Map<string, number>();
  if (editingRequest) {
    for (const line of editingRequest.gadgetItems) {
      ownReservedByGadget.set(line.gadgetItemId, (ownReservedByGadget.get(line.gadgetItemId) ?? 0) + line.quantity);
    }
  }
  const effectiveMargin = editingRequest
    ? availableMargin + Number(editingRequest.reservedAmount)
    : availableMargin;

  const catalogue = gadgets.map((g) => ({
    id: g.id,
    name: g.name,
    category: g.category,
    price: Number(g.price),
    available: g.stockQuantity - g.reservedQuantity + (ownReservedByGadget.get(g.id) ?? 0),
  }));

  const initialCart = editingRequest
    ? editingRequest.gadgetItems.map((line) => ({ gadgetItemId: line.gadgetItemId, quantity: line.quantity }))
    : [];

  return (
    <>
      <div className="flex w-full flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">
          {editingRequest ? "Modify Gadget Redemption Request" : "Redeem for Gadgets & Accessories"}
        </h1>
        <p className="text-sm text-on-surface-variant">
          Available Margin: <span className="font-semibold text-primary">{formatINR(effectiveMargin)}</span>. No GST or shipping cost applies.
        </p>

        {catalogue.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
            <Icon name="devices" className="text-[32px] text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">No gadgets available yet.</p>
          </div>
        ) : (
          <GadgetCartForm
            catalogue={catalogue}
            availableMargin={effectiveMargin}
            initialCart={initialCart}
            editingRequestId={editingRequest?.id}
          />
        )}
      </div>
    </>
  );
}
