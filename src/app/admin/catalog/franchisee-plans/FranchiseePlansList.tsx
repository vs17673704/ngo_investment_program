"use client";

import { useMemo, useRef, useState } from "react";
import { CollegeMappingDropdown } from "../CollegeMappingDropdown";
import { SearchProgressBar } from "@/components/SearchProgressBar";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

type FranchiseePlanRow = {
  id: string;
  name: string;
  oneTimeDeductiblePrice: string;
  mappedCollegeIds: string[];
};

export function FranchiseePlansList({
  franchiseePlans,
  colleges,
}: {
  franchiseePlans: FranchiseePlanRow[];
  colleges: { id: string; name: string }[];
}) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredPlans = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return franchiseePlans;
    return franchiseePlans.filter((fp) => fp.name.toLowerCase().includes(query));
  }, [franchiseePlans, q]);

  function runSearch(nextQ: string) {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    setSearching(true);
    setQ(nextQ);
    hideTimeout.current = setTimeout(() => setSearching(false), 300);
  }

  return (
    <>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(input);
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-xs font-medium text-on-surface-variant">
            Search
          </label>
          <div className="relative flex items-center">
            <input
              id="q"
              name="q"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Franchisee plan name"
              className={fieldClassName("w-full pr-9")}
            />
            {input ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setInput("");
                  runSearch("");
                }}
                className={buttonStyles("ghost", "icon", "absolute right-2")}
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            ) : null}
          </div>
        </div>
        <button type="submit" className={buttonStyles("primary")}>
          Search
        </button>
      </form>

      <SearchProgressBar active={searching} />

      {filteredPlans.length === 0 ? (
        <div className="rounded-xl bg-surface-container-lowest p-4 text-sm text-on-surface-variant shadow-sm">
          {q.trim() ? "No matching franchisee plans." : "No franchisee plans yet."}
        </div>
      ) : (
        <ul className="flex max-h-[28rem] flex-col gap-3 overflow-auto">
          {filteredPlans.map((fp) => (
            <li key={fp.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
              <p className="font-medium text-primary">
                {fp.name} — ₹{fp.oneTimeDeductiblePrice}
              </p>
              <div className="mt-2">
                {colleges.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">Add colleges to map this plan.</p>
                ) : (
                  <CollegeMappingDropdown
                    franchiseePlanId={fp.id}
                    colleges={colleges}
                    mappedCollegeIds={fp.mappedCollegeIds}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
