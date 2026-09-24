"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { formatINR } from "@/lib/format";
import FranchiseeForm from "./FranchiseeForm";

type PlanForList = {
  id: string;
  name: string;
  oneTimeDeductiblePrice: string;
  colleges: { id: string; name: string }[];
};

// The public Franchisee catalog page links here as `#plan-<id>` (a scroll
// anchor, since URL fragments never reach the server) so a user who clicked
// one specific plan lands on a page that would otherwise still list every
// plan. Reading the hash client-side lets us show ONLY the plan they picked
// — the rest stay hidden behind an explicit "browse all plans" toggle,
// rather than cluttering the page with forms for plans they never selected.
export function FranchiseeEnquiryList({
  plans,
  availableMargin,
}: {
  plans: PlanForList[];
  availableMargin: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const match = window.location.hash.match(/^#plan-(.+)$/);
    if (!match) return;
    // Intentionally read the real location.hash only after mount: computing
    // it during the initial render (e.g. via a useState initializer) would
    // make the client's first render diverge from the server-rendered HTML
    // (where `window` doesn't exist), causing a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(match[1]);
  }, []);

  const selectedPlan = selectedId ? plans.find((p) => p.id === selectedId) : undefined;
  const isFiltered = Boolean(selectedPlan) && !showAll;
  const visiblePlans = isFiltered && selectedPlan ? [selectedPlan] : plans;

  return (
    <div className="flex flex-col gap-3">
      {isFiltered && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex min-h-touch items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline"
        >
          <Icon name="apps" className="text-[18px]" />
          Browse all {plans.length} franchisee plans
        </button>
      )}

      {visiblePlans.map((plan) => {
        const isSelected = plan.id === selectedId;
        const shortfall = Number(plan.oneTimeDeductiblePrice) - availableMargin;

        return (
          <div
            key={plan.id}
            id={`plan-${plan.id}`}
            className={`scroll-mt-24 rounded-xl p-4 shadow-sm transition-colors ${
              isSelected ? "bg-primary-container/30 ring-2 ring-primary" : "bg-surface-container-lowest"
            }`}
          >
            <p className="font-medium text-primary">{plan.name}</p>
            <p className="text-sm text-on-surface-variant">
              One-time deductible: {formatINR(plan.oneTimeDeductiblePrice)}
            </p>
            {shortfall > 0 && (
              <p className="mt-0.5 text-sm font-medium text-amber-800">
                Shortfall {formatINR(shortfall)} — enquiry will await shortfall resolution.
              </p>
            )}
            <FranchiseeForm franchiseePlanId={plan.id} colleges={plan.colleges} />
          </div>
        );
      })}

      {!isFiltered && selectedPlan && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="flex min-h-touch items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline"
        >
          <Icon name="filter_alt" className="text-[18px]" />
          Show only {selectedPlan.name}
        </button>
      )}
    </div>
  );
}
