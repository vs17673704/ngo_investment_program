"use client";

import { useMemo, useRef, useState } from "react";
import { SearchProgressBar } from "@/components/SearchProgressBar";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

type CourseRow = { id: string; name: string; fee: string };
type UniversityRow = { id: string; name: string; courses: CourseRow[] };

export function UniversitiesList({ universities }: { universities: UniversityRow[] }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredUniversities = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return universities;
    return universities.filter(
      (u) =>
        u.name.toLowerCase().includes(query) ||
        u.courses.some((c) => c.name.toLowerCase().includes(query)),
    );
  }, [universities, q]);

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
              placeholder="University or course name"
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

      {filteredUniversities.length === 0 ? (
        <div className="rounded-xl bg-surface-container-lowest p-4 text-sm text-on-surface-variant shadow-sm">
          {q.trim() ? "No matching universities or courses." : "No universities yet."}
        </div>
      ) : (
        <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
          {filteredUniversities.map((u) => (
            <li key={u.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
              <p className="font-medium text-primary">{u.name}</p>
              {u.courses.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No courses yet.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-sm text-on-surface-variant">
                  {u.courses.map((c) => (
                    <li key={c.id}>
                      {c.name} — ₹{c.fee}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
