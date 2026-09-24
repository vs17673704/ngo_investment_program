"use client";

import { useMemo, useRef, useState } from "react";
import { SearchProgressBar } from "@/components/SearchProgressBar";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

type AuditEntryRow = {
  id: string;
  eventType: string;
  actorEmail: string;
  entityRef: string | null;
  timestamp: string;
  detailsJson: string | null;
};

export function AuditLogList({ entries }: { entries: AuditEntryRow[] }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredEntries = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter(
      (e) =>
        e.eventType.toLowerCase().includes(query) ||
        e.actorEmail.toLowerCase().includes(query) ||
        (e.entityRef?.toLowerCase().includes(query) ?? false),
    );
  }, [entries, q]);

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
              placeholder="Event type, actor email, or entity ref"
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

      <p className="text-sm text-on-surface-variant">
        {filteredEntries.length} {q.trim() ? "matching" : "recent"} event(s).
      </p>

      {filteredEntries.length === 0 ? (
        <div className="rounded-xl bg-surface-container-lowest p-4 text-sm text-on-surface-variant shadow-sm">
          {q.trim() ? "No matching audit events." : "No audit events yet."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filteredEntries.map((e) => (
            <li key={e.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
              <p className="font-medium text-primary">{e.eventType}</p>
              <p className="text-sm text-on-surface-variant">
                {e.actorEmail}
                {e.entityRef ? ` · ${e.entityRef}` : ""} · {e.timestamp}
              </p>
              {e.detailsJson ? (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-container-low p-3 text-xs text-on-surface">
                  {e.detailsJson}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
