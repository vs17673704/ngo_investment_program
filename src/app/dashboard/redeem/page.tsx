import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getRedeemableBalance, getAvailableMargin } from "@/lib/redemption-engine";
import { cancelRedemptionAction } from "./actions";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";
import { PopupRedeemTile } from "./PopupRedeemTile";
import { RefundPanel } from "./refund/RefundPanel";
import { ReinvestmentPanel } from "./reinvestment/ReinvestmentPanel";
import { DonationPanel } from "./donation/DonationPanel";

const LINK_CATEGORIES = [
  { href: "/dashboard/redeem/course", label: "Course", desc: "Redeem toward a university course fee.", icon: "school" },
  { href: "/dashboard/redeem/gadgets", label: "Gadgets & Accessories", desc: "Redeem for a gadget or accessory.", icon: "devices" },
  { href: "/franchisee", label: "Franchisee", desc: "Browse franchisee plans to raise an enquiry.", icon: "storefront" },
];

const POPUP_CATEGORIES = [
  { key: "refund", label: "Refund", desc: "Request a partial or complete refund.", icon: "undo", title: "Request a Refund" },
  { key: "reinvestment", label: "Reinvestment", desc: "Reinvest your redeemable balance.", icon: "savings", title: "Reinvest Redeemable Balance" },
  { key: "donation", label: "Donation", desc: "Donate a partial or complete amount.", icon: "volunteer_activism", title: "Donate" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  PENDING: "text-on-surface-variant bg-surface-container",
  AWAITING_SHORTFALL_RESOLUTION: "text-amber-800 bg-surface-container",
  APPROVED: "text-secondary bg-secondary-container/30",
  REJECTED: "text-error bg-error-container",
  CANCELLED: "text-on-surface-variant bg-surface-container",
};

export default async function RedeemPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [redeemableBalance, availableMargin, requests, enquiries] = await Promise.all([
    getRedeemableBalance(session.sub),
    getAvailableMargin(session.sub),
    prisma.redemptionRequest.findMany({
      where: { userId: session.sub },
      include: { statusEvents: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.franchiseeRedemptionEnquiry.findMany({
      where: { userId: session.sub },
      include: { franchiseePlan: true, college: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      <div className="flex w-full flex-col gap-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Redeem Hub</h1>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-container-lowest p-3 shadow-sm">
            <p className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Actual Redeemable Balance</p>
            <p className="text-lg font-bold tracking-tight text-primary">{formatINR(redeemableBalance)}</p>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-container-lowest p-3 shadow-sm">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Available Margin</p>
              <p className="truncate text-[11px] text-on-surface-variant">Redeemable balance minus any pending requests</p>
            </div>
            <p className="shrink-0 text-lg font-bold tracking-tight text-primary">{formatINR(availableMargin)}</p>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold text-primary">Redeem Options</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LINK_CATEGORIES.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="flex items-center gap-3 rounded-xl bg-surface-container-lowest p-3 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface">
                  <Icon name={c.icon} className="text-[18px]" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-primary">{c.label}</p>
                  <p className="truncate text-xs text-on-surface-variant">{c.desc}</p>
                </div>
              </Link>
            ))}
            {POPUP_CATEGORIES.map((c) => {
              const { key, ...rest } = c;
              return (
                <PopupRedeemTile key={key} {...rest}>
                  {key === "refund" && <RefundPanel />}
                  {key === "reinvestment" && <ReinvestmentPanel />}
                  {key === "donation" && <DonationPanel />}
                </PopupRedeemTile>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg font-semibold text-primary">Your Redemption Requests</h2>
          {requests.length === 0 && enquiries.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-container-lowest p-5 text-center shadow-sm">
              <Icon name="currency_exchange" className="text-[24px] text-on-surface-variant" />
              <p className="text-sm text-on-surface-variant">No redemption requests yet.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {requests.map((r) => {
                // Design.md 3.7 [BRD-required]: the most recent status event
                // carrying a note is the "Admin concern/message" for this
                // request (a reject reason today; a shortfall-verification
                // note if that's the latest transition).
                const adminNoteEvent = [...r.statusEvents].reverse().find((e) => e.note);
                return (
                  <li key={r.id} className="rounded-xl bg-surface-container-lowest p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-primary">
                          {r.category} · {formatINR(r.requestedAmount)}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-on-surface-variant">
                          <span
                            data-testid="request-status-badge"
                            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[r.status] ?? "bg-surface-container text-on-surface-variant"}`}
                          >
                            {r.status.replace(/_/g, " ")}
                          </span>
                          {Number(r.shortfallAmount) > 0 ? `Shortfall ${formatINR(r.shortfallAmount)}` : ""}
                        </p>
                      </div>
                      {["PENDING", "AWAITING_SHORTFALL_RESOLUTION"].includes(r.status) && (
                        <div className="flex shrink-0 items-center gap-2">
                          {r.category === "GADGETS" && (
                            <Link
                              href={`/dashboard/redeem/gadgets?edit=${r.id}`}
                              className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
                            >
                              Edit
                            </Link>
                          )}
                          <form action={cancelRedemptionAction.bind(null, r.id)}>
                            <button
                              type="submit"
                              className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
                            >
                              Cancel
                            </button>
                          </form>
                        </div>
                      )}
                      {r.category === "DONATION" && r.status === "APPROVED" && (
                        <a
                          href={`/api/redemptions/${r.id}/receipt`}
                          className="flex min-h-touch shrink-0 items-center justify-center rounded-lg border border-surface-container-high px-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
                        >
                          Download receipt
                        </a>
                      )}
                    </div>

                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        View details
                      </summary>
                      <div className="mt-1.5 flex flex-col gap-1.5 border-t border-surface-container pt-1.5 text-xs">
                        <p className="text-on-surface-variant">
                          Available margin at request: <span className="text-on-surface">{formatINR(r.availableMarginAtRequest)}</span>
                        </p>
                        {Number(r.shortfallAmount) > 0 && (
                          <p className="text-on-surface-variant">
                            Shortfall: <span className="text-on-surface">{formatINR(r.shortfallAmount)}</span>
                            {r.shortfallReference ? ` · Reference: ${r.shortfallReference}` : ""}
                            {r.shortfallVerifiedAt
                              ? ` · Verified ${r.shortfallVerifiedAt.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}`
                              : " · Awaiting verification"}
                          </p>
                        )}
                        {adminNoteEvent && (
                          <p className="rounded-lg bg-surface-container p-2 text-on-surface">
                            <span className="font-semibold">Admin message:</span> {adminNoteEvent.note}
                          </p>
                        )}
                        <div>
                          <p className="text-[11px] font-semibold tracking-wider text-on-surface-variant uppercase">Status timeline</p>
                          <ul className="mt-1 flex flex-col gap-1">
                            {r.statusEvents.map((e) => (
                              <li key={e.id} className="flex items-center justify-between gap-2 text-on-surface-variant">
                                <span>{e.status.replace(/_/g, " ")}</span>
                                <span>{e.createdAt.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </details>
                  </li>
                );
              })}
              {enquiries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-primary">
                      FRANCHISEE · {e.franchiseePlan.name} ({e.college.name}) · {formatINR(e.requestedAmount)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-on-surface-variant">
                      <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[e.status] ?? "bg-surface-container text-on-surface-variant"}`}>
                        {e.status.replace(/_/g, " ")}
                      </span>
                      {Number(e.shortfallAmount) > 0 ? `Shortfall ${formatINR(e.shortfallAmount)}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
