import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  approveRedemptionAction,
  rejectRedemptionAction,
  verifyShortfallAction,
  approveFranchiseeEnquiryAction,
  rejectFranchiseeEnquiryAction,
  verifyFranchiseeShortfallAction,
  expireStaleRedemptionsAction,
} from "./actions";
import ShortfallForm from "./ShortfallForm";
import RejectForm from "./RejectForm";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";
import { SearchFieldWithClear } from "@/components/SearchFieldWithClear";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

// BRD Rule XL / Design.md §5.7: the queue supports sorting by date or by
// user (there is no separate "name" field on User, so "name" sorts/searches
// by email — the only user-identifying field this screen displays) and
// free-text search by user email. Sorting/searching is a display-only
// concern: it never changes the `where` scope (still PENDING /
// AWAITING_SHORTFALL_RESOLUTION only) or any financial state.
const SORT_OPTIONS = ["date_desc", "date_asc", "name_asc", "name_desc"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];
const DEFAULT_SORT: SortOption = "date_asc";

function parseSort(value: string | undefined): SortOption {
  return SORT_OPTIONS.includes(value as SortOption) ? (value as SortOption) : DEFAULT_SORT;
}

function orderByFor(sort: SortOption): Prisma.RedemptionRequestOrderByWithRelationInput {
  switch (sort) {
    case "date_desc":
      return { createdAt: "desc" };
    case "name_asc":
      return { user: { email: "asc" } };
    case "name_desc":
      return { user: { email: "desc" } };
    case "date_asc":
    default:
      return { createdAt: "asc" };
  }
}

function franchiseeOrderByFor(sort: SortOption): Prisma.FranchiseeRedemptionEnquiryOrderByWithRelationInput {
  switch (sort) {
    case "date_desc":
      return { createdAt: "desc" };
    case "name_asc":
      return { user: { email: "asc" } };
    case "name_desc":
      return { user: { email: "desc" } };
    case "date_asc":
    default:
      return { createdAt: "asc" };
  }
}

export default async function AdminRedemptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const { q, sort: sortParam } = await searchParams;
  const sort = parseSort(sortParam);
  const search = q?.trim();

  const requestsWhere: Prisma.RedemptionRequestWhereInput = {
    status: { in: ["PENDING", "AWAITING_SHORTFALL_RESOLUTION"] },
    ...(search ? { user: { email: { contains: search, mode: "insensitive" } } } : {}),
  };
  const enquiriesWhere: Prisma.FranchiseeRedemptionEnquiryWhereInput = {
    status: { in: ["PENDING", "AWAITING_SHORTFALL_RESOLUTION"] },
    ...(search ? { user: { email: { contains: search, mode: "insensitive" } } } : {}),
  };

  const [requests, enquiries] = await Promise.all([
    prisma.redemptionRequest.findMany({
      where: requestsWhere,
      include: {
        user: true,
        gadgetItems: { include: { gadgetItem: true } },
        targetPlan: true,
        donationRecipient: true,
      },
      orderBy: orderByFor(sort),
    }),
    prisma.franchiseeRedemptionEnquiry.findMany({
      where: enquiriesWhere,
      include: { user: true, franchiseePlan: true, college: true },
      orderBy: franchiseeOrderByFor(sort),
    }),
  ]);

  return (
    <>
      <AdminPageHeader title="Redemption & Enquiry Approval Queue" />
      <form action={expireStaleRedemptionsAction}>
        <button type="submit" className={buttonStyles("secondary")}>
          Expire stale requests now
        </button>
      </form>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <SearchFieldWithClear id="q" name="q" label="Search by user email" defaultValue={q} placeholder="user@example.com" />
        <div className="flex flex-col gap-1">
          <label htmlFor="sort" className="text-xs font-medium text-on-surface-variant">
            Sort by
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={sort}
            className="min-h-touch rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
          >
            <option value="date_asc">Date (oldest first)</option>
            <option value="date_desc">Date (newest first)</option>
            <option value="name_asc">User email (A–Z)</option>
            <option value="name_desc">User email (Z–A)</option>
          </select>
        </div>
        <button type="submit" className={buttonStyles("primary")}>
          Search
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-primary">Franchisee enquiries</h2>
        {enquiries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
            <Icon name="school" className="text-[32px] text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">
              {search ? `No pending franchisee enquiries match "${search}".` : "No pending franchisee enquiries."}
            </p>
          </div>
        ) : (
          <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
            {enquiries.map((e) => {
              const canApprove =
                e.status === "PENDING" || (e.status === "AWAITING_SHORTFALL_RESOLUTION" && e.shortfallVerifiedAt);
              return (
                <Card as="li" key={e.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-primary">
                        {e.user.email} · {e.franchiseePlan.name} ({e.college.name}) · ₹
                        {Number(e.requestedAmount).toFixed(2)}
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        {e.status}
                        {Number(e.shortfallAmount) > 0
                          ? ` · shortfall ₹${Number(e.shortfallAmount).toFixed(2)}`
                          : ""}
                        {e.shortfallVerifiedAt ? " · shortfall verified" : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <form action={approveFranchiseeEnquiryAction.bind(null, e.id)}>
                        <button
                          type="submit"
                          disabled={!canApprove}
                          className={buttonStyles("primary")}
                        >
                          Approve
                        </button>
                      </form>
                      <form action={rejectFranchiseeEnquiryAction.bind(null, e.id)}>
                        <button
                          type="submit"
                          className={buttonStyles("secondary")}
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  </div>
                  {e.status === "AWAITING_SHORTFALL_RESOLUTION" && !e.shortfallVerifiedAt && (
                    <ShortfallForm action={verifyFranchiseeShortfallAction.bind(null, e.id)} />
                  )}
                </Card>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-primary">Redemption requests</h2>
        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
            <Icon name="currency_exchange" className="text-[32px] text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">
              {search ? `No pending redemption requests match "${search}".` : "No pending redemption requests."}
            </p>
          </div>
        ) : (
          <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
            {requests.map((r) => {
              const canApprove =
                r.status === "PENDING" || (r.status === "AWAITING_SHORTFALL_RESOLUTION" && r.shortfallVerifiedAt);
              return (
                <Card as="li" key={r.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-primary">
                        {r.user.email} · {r.category} · ₹{Number(r.requestedAmount).toFixed(2)}
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        {r.status}
                        {Number(r.shortfallAmount) > 0
                          ? ` · shortfall ₹${Number(r.shortfallAmount).toFixed(2)}`
                          : ""}
                        {r.shortfallVerifiedAt ? " · shortfall verified" : ""}
                      </p>
                      {r.category === "GADGETS" && r.gadgetItems.length > 0 && (
                        <p className="mt-0.5 text-xs text-on-surface-variant">
                          {r.gadgetItems.map((line) => `${line.gadgetItem.name} x${line.quantity}`).join(", ")}
                        </p>
                      )}
                      {r.category === "REINVESTMENT" && r.targetPlan && (
                        <p className="mt-0.5 text-xs text-on-surface-variant">Target plan: {r.targetPlan.name}</p>
                      )}
                      {r.category === "DONATION" && r.donationRecipient && (
                        <p className="mt-0.5 text-xs text-on-surface-variant">
                          Recipient: {r.donationRecipient.name}
                          {r.consentGiven ? " · Consent given" : " · Consent NOT given"}
                          {r.donationReference && ` · Ref: ${r.donationReference}`}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <form action={approveRedemptionAction.bind(null, r.id)}>
                        <button
                          type="submit"
                          disabled={!canApprove}
                          className={buttonStyles("primary")}
                        >
                          Approve
                        </button>
                      </form>
                      <RejectForm action={rejectRedemptionAction.bind(null, r.id)} />
                    </div>
                  </div>
                  {r.status === "AWAITING_SHORTFALL_RESOLUTION" && !r.shortfallVerifiedAt && (
                    <ShortfallForm action={verifyShortfallAction.bind(null, r.id)} />
                  )}
                </Card>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
