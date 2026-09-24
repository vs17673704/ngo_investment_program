"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";

export type CatalogFranchiseePlan = {
  id: string;
  name: string;
  oneTimeDeductiblePrice: string;
  colleges: string[];
};

export function FranchiseeCatalog({
  plans,
  isLoggedIn = false,
}: {
  plans: CatalogFranchiseePlan[];
  isLoggedIn?: boolean;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const visiblePlans = useMemo(() => {
    const q = appliedSearch.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter(
      (p) => p.name.toLowerCase().includes(q) || p.colleges.some((c) => c.toLowerCase().includes(q)),
    );
  }, [plans, appliedSearch]);

  return (
    <>
      <section className="mb-space-xl">
        <div className="flex flex-col justify-between gap-4 rounded-xl bg-surface-container-lowest p-3 shadow-sm lg:flex-row lg:items-center">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedSearch(searchInput);
            }}
          >
            <div className="flex h-11 items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-low px-3">
              <label className="sr-only" htmlFor="franchisee-plan-search">
                Search plans or mapped colleges
              </label>
              <input
                id="franchisee-plan-search"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search plans or colleges..."
                className="w-80 bg-transparent text-sm font-medium text-on-surface placeholder:text-on-surface-variant focus:outline-none"
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
          <div className="flex shrink-0 items-center gap-2 text-sm text-on-surface-variant">
            <Icon name="check_circle" className="text-[18px] text-secondary" />
            <span>Verified Institutional Partnerships</span>
          </div>
        </div>
      </section>

      {visiblePlans.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant">
            <Icon name="search_off" className="text-[24px]" />
          </div>
          <div className="font-heading text-lg font-semibold text-on-surface">No Franchisee Plans Found</div>
          <p className="max-w-md text-sm text-on-surface-variant">
            No franchisee plans match your search query. Try searching by college name or plan title.
          </p>
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {visiblePlans.map((plan) => (
            <article
              key={plan.id}
              className="flex flex-col justify-between rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm transition-all hover:shadow-md"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="font-heading text-lg font-semibold text-on-surface">{plan.name}</h2>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border border-outline-variant/20 bg-surface-container-low p-4">
                  <span className="text-sm text-on-surface-variant">One-Time Deductible Price</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tracking-tight text-on-surface">
                      {formatINR(plan.oneTimeDeductiblePrice)}
                    </span>
                    <span className="text-sm text-on-surface-variant">/ allotment</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-wider text-on-surface uppercase">
                      Associated Mapped Colleges
                    </span>
                    <span className="text-xs font-medium text-secondary">{plan.colleges.length} Mapped</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.colleges.length > 0 ? (
                      plan.colleges.map((college) => (
                        <span
                          key={college}
                          className="rounded bg-surface-container px-2.5 py-1 text-sm text-on-surface"
                        >
                          {college}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-on-surface-variant">No colleges mapped yet</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 border-t border-outline-variant/20 pt-4">
                <a
                  href={
                    isLoggedIn
                      ? `/dashboard/redeem/franchisee#plan-${plan.id}`
                      : "/login?redirect=/dashboard/redeem/franchisee"
                  }
                  className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-on-primary transition-all hover:bg-primary-container"
                >
                  <span>{isLoggedIn ? "Redeem" : "Log In to Redeem"}</span>
                  <Icon name="arrow_forward" className="text-[18px]" />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
