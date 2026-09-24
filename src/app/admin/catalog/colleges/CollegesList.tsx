"use client";

import { useMemo, useRef, useState } from "react";
import { SearchProgressBar } from "@/components/SearchProgressBar";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

type CollegeRow = { id: string; name: string };

export function CollegesList({ colleges }: { colleges: CollegeRow[] }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredColleges = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return colleges;
    return colleges.filter((c) => c.name.toLowerCase().includes(query));
  }, [colleges, q]);

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
              placeholder="College name"
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

      {filteredColleges.length === 0 ? (
        <div className="rounded-xl bg-surface-container-lowest p-4 text-sm text-on-surface-variant shadow-sm">
          {q.trim() ? "No matching colleges." : "No colleges yet."}
        </div>
      ) : (
        <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
          {filteredColleges.map((c) => (
            <li key={c.id} className="rounded-xl bg-surface-container-lowest p-4 text-sm text-on-surface shadow-sm">
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
