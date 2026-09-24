"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";

export type ReferredCommission = {
  id: string;
  amount: string;
  commissionType: string;
  status: string;
  accrualDateLabel: string;
  planName: string | null;
};

export type ReferredUpcomingPlan = {
  id: string;
  planName: string;
  amount: number;
};

export type ReferredPerson = {
  id: string;
  email: string;
  status: string;
  expiryDateLabel: string;
  commissions: ReferredCommission[];
  upcomingPlans: ReferredUpcomingPlan[];
};

export function PeopleYouReferred({ referrals }: { referrals: ReferredPerson[] }) {
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const visibleReferrals = useMemo(() => {
    const query = appliedSearch.trim().toLowerCase();
    if (!query) return referrals;
    return referrals.filter(
      (r) =>
        r.email.toLowerCase().includes(query) ||
        r.status.toLowerCase().includes(query) ||
        r.commissions.some((c) => c.planName?.toLowerCase().includes(query)) ||
        r.upcomingPlans.some((up) => up.planName.toLowerCase().includes(query)),
    );
  }, [referrals, appliedSearch]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold text-primary">People you referred</h2>

      {referrals.length > 0 && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedSearch(searchInput);
          }}
        >
          <div className="flex h-11 items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-low px-3">
            <label className="sr-only" htmlFor="referral-search">
              Search referred users by email, status, or plan
            </label>
            <input
              id="referral-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search referred users..."
              className="w-40 bg-transparent text-sm font-medium text-on-surface placeholder:text-on-surface-variant focus:outline-none"
            />
            {searchInput ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearchInput("");
                  setAppliedSearch("");
                }}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-container"
          >
            <Icon name="search" className="text-[18px]" />
            Search
          </button>
        </form>
      )}

      {referrals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
          <Icon name="group_add" className="text-[32px] text-on-surface-variant" />
          <p className="text-sm text-on-surface-variant">
            You haven&apos;t referred anyone yet. Share your referral code above.
          </p>
        </div>
      ) : visibleReferrals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
          <Icon name="search_off" className="text-[32px] text-on-surface-variant" />
          <p className="text-sm text-on-surface-variant">No referred users match your search.</p>
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setAppliedSearch("");
            }}
            className="min-h-9 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary transition-all hover:bg-primary-container"
          >
            Clear Search
          </button>
        </div>
      ) : (
        <ul className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-1">
          {visibleReferrals.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 text-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-on-surface">{r.email}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-on-surface-variant">Expires {r.expiryDateLabel}</span>
                  <span className="rounded bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                    {r.status}
                  </span>
                </div>
              </div>

              {r.commissions.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-surface-container pt-2">
                  <p className="text-[11px] font-semibold tracking-wider text-on-surface-variant uppercase">
                    Commission history
                  </p>
                  {r.commissions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-on-surface-variant">
                        {c.planName ?? "—"} · {c.commissionType.replace(/_/g, " ")} · {c.accrualDateLabel}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-primary">{formatINR(c.amount)}</span>
                        <span className="rounded bg-surface-container px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant">
                          {c.status.replace(/_/g, " ")}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {r.upcomingPlans.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-surface-container pt-2">
                  <p className="text-[11px] font-semibold tracking-wider text-on-surface-variant uppercase">
                    Upcoming eligible commission
                  </p>
                  {r.upcomingPlans.map((up) => (
                    <div key={up.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-on-surface-variant">{up.planName}</span>
                      <span className="font-semibold text-primary">{formatINR(up.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
