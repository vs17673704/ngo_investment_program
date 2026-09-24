"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { toggleFranchiseeMappingAction } from "./actions";

export function CollegeMappingDropdown({
  franchiseePlanId,
  colleges,
  mappedCollegeIds,
}: {
  franchiseePlanId: string;
  colleges: { id: string; name: string }[];
  mappedCollegeIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapped = new Set(mappedCollegeIds);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = colleges.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-touch items-center gap-2 rounded-lg border border-surface-container-high px-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
      >
        <Icon name="school" className="text-[18px]" />
        {mapped.size === 0 ? "Map colleges" : `${mapped.size} college${mapped.size === 1 ? "" : "s"} mapped`}
        <Icon name={open ? "expand_less" : "expand_more"} className="text-[18px]" />
      </button>

      {open ? (
        <div className="absolute z-20 mt-1 w-72 rounded-xl border border-surface-container-high bg-surface-container-lowest p-2 shadow-lg">
          <div className="relative">
            <Icon
              name="search"
              className="absolute top-1/2 left-2 -translate-y-1/2 text-[16px] text-on-surface-variant"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search colleges"
              className="min-h-touch w-full rounded-lg border border-outline-variant bg-surface-container-low pr-8 pl-8 text-sm text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
              >
                <Icon name="close" className="text-[14px]" />
              </button>
            ) : null}
          </div>
          <ul className="mt-2 flex max-h-56 flex-col overflow-auto">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-sm text-on-surface-variant">No colleges found.</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <form action={toggleFranchiseeMappingAction.bind(null, franchiseePlanId, c.id)}>
                    <label className="flex min-h-touch cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-on-surface hover:bg-surface-container">
                      <input
                        type="checkbox"
                        checked={mapped.has(c.id)}
                        onChange={(e) => e.currentTarget.form?.requestSubmit()}
                        className="h-4 w-4 accent-primary"
                      />
                      {c.name}
                    </label>
                  </form>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
