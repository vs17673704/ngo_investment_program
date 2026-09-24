"use client";

import { useMemo, useRef, useState } from "react";
import { CancelReferralForm } from "../users/CancelReferralForm";
import { SearchProgressBar } from "@/components/SearchProgressBar";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

type ReferralRow = {
  id: string;
  referrerEmail: string;
  referredEmail: string;
  expiryDate: string;
};

export function ReferralsTable({ referrals }: { referrals: ReferralRow[] }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredReferrals = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return referrals;
    return referrals.filter(
      (r) => r.referrerEmail.toLowerCase().includes(query) || r.referredEmail.toLowerCase().includes(query),
    );
  }, [referrals, q]);

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

      {filteredReferrals.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          {q.trim() ? "No matching referral relationships." : "No active referral relationships."}
        </p>
      ) : (
        <div className="max-h-[28rem] overflow-auto rounded-xl">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-surface-container-high bg-surface-container-lowest text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
              <tr>
                <th className="px-4 py-3">Referrer</th>
                <th className="px-4 py-3">Referred user</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {filteredReferrals.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-on-surface">{r.referrerEmail}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{r.referredEmail}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{r.expiryDate}</td>
                  <td className="px-4 py-3">
                    <CancelReferralForm referralId={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
