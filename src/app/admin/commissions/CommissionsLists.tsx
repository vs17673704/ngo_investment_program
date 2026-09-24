"use client";

import { useMemo, useRef, useState } from "react";
import { approveCommissionAction, rejectCommissionAction, creditCommissionAction } from "./actions";
import { SearchProgressBar } from "@/components/SearchProgressBar";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

type CommissionRow = {
  id: string;
  amount: string;
  commissionType: string;
  cyclePosition: number | null;
  referrerEmail: string;
  referredEmail: string;
};

function useCommissionSearch(commissions: CommissionRow[]) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return commissions;
    return commissions.filter(
      (c) => c.referrerEmail.toLowerCase().includes(query) || c.referredEmail.toLowerCase().includes(query),
    );
  }, [commissions, q]);

  function runSearch(nextQ: string) {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    setSearching(true);
    setQ(nextQ);
    hideTimeout.current = setTimeout(() => setSearching(false), 300);
  }

  return { input, setInput, q, searching, filtered, runSearch };
}

export function AccruedCommissionsList({ commissions }: { commissions: CommissionRow[] }) {
  const { input, setInput, q, searching, filtered, runSearch } = useCommissionSearch(commissions);

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
          <label htmlFor="accrued-q" className="text-xs font-medium text-on-surface-variant">
            Search
          </label>
          <div className="relative flex items-center">
            <input
              id="accrued-q"
              name="q"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Referrer or referred user email"
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

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
          <Icon name="military_tech" className="text-[32px] text-on-surface-variant" />
          <p className="text-sm text-on-surface-variant">
            {q.trim() ? "No matching commissions." : "No commissions pending approval."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm"
            >
              <div>
                <p className="font-medium text-primary">
                  ₹{c.amount} · {c.commissionType} (cycle #{c.cyclePosition})
                </p>
                <p className="text-sm text-on-surface-variant">
                  Referrer: {c.referrerEmail} · Referred: {c.referredEmail}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={approveCommissionAction.bind(null, c.id)}>
                  <button
                    type="submit"
                    className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container"
                  >
                    Approve
                  </button>
                </form>
                <form action={rejectCommissionAction.bind(null, c.id)}>
                  <button
                    type="submit"
                    className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-3 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ApprovedCommissionsList({ commissions }: { commissions: CommissionRow[] }) {
  const { input, setInput, q, searching, filtered, runSearch } = useCommissionSearch(commissions);

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
          <label htmlFor="approved-q" className="text-xs font-medium text-on-surface-variant">
            Search
          </label>
          <div className="relative flex items-center">
            <input
              id="approved-q"
              name="q"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Referrer or referred user email"
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

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
          <Icon name="account_balance" className="text-[32px] text-on-surface-variant" />
          <p className="text-sm text-on-surface-variant">
            {q.trim() ? "No matching commissions." : "No commissions awaiting credit."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm"
            >
              <div>
                <p className="font-medium text-primary">
                  ₹{c.amount} · {c.commissionType} (cycle #{c.cyclePosition})
                </p>
                <p className="text-sm text-on-surface-variant">
                  Referrer: {c.referrerEmail} · Referred: {c.referredEmail}
                </p>
              </div>
              <form action={creditCommissionAction.bind(null, c.id)}>
                <button
                  type="submit"
                  className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container"
                >
                  Credit to ledger
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
