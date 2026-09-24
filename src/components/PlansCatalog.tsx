"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";

export type CatalogPlan = {
  id: string;
  name: string;
  tenureMonths: number;
  paymentFrequency: "MONTHLY" | "LUMPSUM";
  presetAmounts: string[];
  ratePercent: string;
  formulaType: string;
  rewardPercent: string | null;
  isSubscribable: boolean;
};

const FILTERS = [
  { key: "all", label: "All Plans" },
  { key: "MONTHLY", label: "Monthly SIP" },
  { key: "LUMPSUM", label: "Lumpsum Lock" },
] as const;

export function PlansCatalog({ plans }: { plans: CatalogPlan[] }) {
  const [filter, setFilter] = useState<"all" | "MONTHLY" | "LUMPSUM">("all");
  const [sort, setSort] = useState("default");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const visiblePlans = useMemo(() => {
    const query = appliedSearch.trim().toLowerCase();
    const filtered = plans.filter(
      (p) => (filter === "all" || p.paymentFrequency === filter) && (query === "" || p.name.toLowerCase().includes(query)),
    );
    const sorted = [...filtered];
    if (sort === "tenure-asc") sorted.sort((a, b) => a.tenureMonths - b.tenureMonths);
    if (sort === "tenure-desc") sorted.sort((a, b) => b.tenureMonths - a.tenureMonths);
    if (sort === "rate-desc") sorted.sort((a, b) => Number(b.ratePercent) - Number(a.ratePercent));
    return sorted;
  }, [plans, filter, sort, appliedSearch]);

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
              <label className="sr-only" htmlFor="plan-search">
                Search plans by name
              </label>
              <input
                id="plan-search"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search plans..."
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
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-11 items-center rounded-lg border border-outline-variant bg-surface-container-low px-3">
              <Icon name="filter_list" className="mr-2 text-[18px] text-on-surface-variant" />
              <label className="sr-only" htmlFor="plan-filter">
                Filter plans by payment frequency
              </label>
              <select
                id="plan-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value as "all" | "MONTHLY" | "LUMPSUM")}
                className="cursor-pointer bg-transparent pr-2 text-sm font-medium text-on-surface focus:outline-none"
              >
                {FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex h-11 items-center rounded-lg border border-outline-variant bg-surface-container-low px-3">
              <Icon name="sort" className="mr-2 text-[18px] text-on-surface-variant" />
              <label className="sr-only" htmlFor="tenure-sort">
                Sort by Tenure
              </label>
              <select
                id="tenure-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="cursor-pointer bg-transparent pr-2 text-sm font-medium text-on-surface focus:outline-none"
              >
                <option value="default">Sort: Recommended</option>
                <option value="tenure-asc">Tenure: Short to Long</option>
                <option value="tenure-desc">Tenure: Long to Short</option>
                <option value="rate-desc">Highest Yield First</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {visiblePlans.length === 0 ? (
        <section className="mb-16 flex flex-col items-center justify-center rounded-xl bg-surface-container-lowest p-16 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
            <Icon name="folder_off" className="text-[32px]" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-on-surface">No Matching Investment Plans Available</h3>
          <p className="mb-6 max-w-md text-sm text-on-surface-variant">
            We could not find active plans matching your selected criteria. Reset filters or consult your regional
            franchisee advisor for customized institutional tranches.
          </p>
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setSort("default");
              setSearchInput("");
              setAppliedSearch("");
            }}
            className="min-h-touch rounded-xl bg-primary px-6 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-container"
          >
            Reset All Filter Criteria
          </button>
        </section>
      ) : (
        <section className="mb-16 max-h-[70vh] overflow-y-auto rounded-xl">
          <div className="grid grid-cols-1 gap-4 p-1 md:grid-cols-2 lg:grid-cols-4">
            {visiblePlans.map((plan, idx) => (
              <PlanCard key={plan.id} plan={plan} featured={idx === 1} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function PlanCard({ plan, featured }: { plan: CatalogPlan; featured: boolean }) {
  return (
    <div
      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl bg-surface-container-lowest p-6 shadow-sm transition-all hover:shadow-md ${
        featured ? "shadow-md hover:shadow-xl" : ""
      }`}
    >
      {featured ? <div className="absolute top-0 right-0 left-0 h-1 bg-secondary" /> : null}
      <div>
        <h2
          className={`mb-4 line-clamp-2 min-h-[3.5rem] font-heading text-xl font-semibold tracking-tight text-on-surface ${featured ? "pt-1" : ""}`}
        >
          {plan.name}
        </h2>
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-on-surface-variant">Annual Yield</span>
            <span className="text-2xl font-bold tracking-tight text-on-surface">
              {Number(plan.ratePercent).toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-medium text-on-surface-variant">
            <span>Method</span>
            <span className="text-on-surface">{plan.formulaType.replaceAll("_", " ")}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-medium text-on-surface-variant">
            <span>Tenure</span>
            <span className="text-on-surface">{plan.tenureMonths} Months</span>
          </div>
          <div className="flex items-center justify-between text-xs font-medium text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Icon name="school" className="text-[14px] text-secondary" />
              Reward Points
            </span>
            <span className="text-secondary">{Number(plan.rewardPercent ?? 0).toFixed(2)}%</span>
          </div>
        </div>
      </div>
      {/* Same reasoning as the reward slot above: always reserve the button's
          height so a non-subscribable card's footer doesn't collapse and
          shift the grid row's alignment relative to its subscribable
          neighbors. A plain div (not a Link) when non-subscribable, so it's
          neither focusable nor prefetched. */}
      {plan.isSubscribable ? (
        <Link
          href={`/plans/${plan.id}/subscribe`}
          className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-container"
        >
          <span>Subscribe</span>
          <Icon name="arrow_forward" className="text-[16px]" />
        </Link>
      ) : (
        <div className="min-h-touch w-full" />
      )}
    </div>
  );
}
