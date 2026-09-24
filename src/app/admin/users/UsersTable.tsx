"use client";

import { useMemo, useRef, useState } from "react";
import { toggleUserLockAction, toggleReferralCodeActiveAction } from "./actions";
import { SearchProgressBar } from "@/components/SearchProgressBar";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

type UserRow = {
  id: string;
  email: string;
  mobileNumber: string | null;
  role: string;
  referralCode: string;
  referralCodeActive: boolean;
  rewardPointsBalance: number;
  locked: boolean;
  joinedAt: string;
};

export function UsersTable({ users }: { users: UserRow[] }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredUsers = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(query) ||
        (u.mobileNumber?.toLowerCase().includes(query) ?? false) ||
        u.referralCode.toLowerCase().includes(query),
    );
  }, [users, q]);

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
              placeholder="Email, mobile, or referral code"
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
        {filteredUsers.length} {q.trim() ? "matching" : "registered"} user(s).
      </p>

      <div className="max-h-[28rem] overflow-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-surface-container-high bg-surface-container-lowest text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Referral Code</th>
              <th className="px-4 py-3">Reward Points</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {filteredUsers.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 text-on-surface">{u.email}</td>
                <td className="px-4 py-3 text-on-surface-variant">{u.mobileNumber ?? "—"}</td>
                <td className="px-4 py-3 text-on-surface-variant">{u.role}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-on-surface">{u.referralCode}</span>
                  {!u.referralCodeActive && <span className="ml-1 text-xs font-medium text-error">(inactive)</span>}
                </td>
                <td className="px-4 py-3 text-on-surface-variant">{u.rewardPointsBalance}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      u.locked ? "bg-error-container text-error" : "bg-secondary-container/30 text-secondary"
                    }`}
                  >
                    {u.locked ? "Locked" : "Active"}
                  </span>
                </td>
                <td className="px-4 py-3 text-on-surface-variant">{u.joinedAt}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <form action={toggleUserLockAction.bind(null, u.id)}>
                      <button
                        type="submit"
                        className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-2 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                      >
                        {u.locked ? "Unlock" : "Lock"}
                      </button>
                    </form>
                    {u.role === "USER" && (
                      <form action={toggleReferralCodeActiveAction.bind(null, u.id)}>
                        <button
                          type="submit"
                          className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-2 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                        >
                          {u.referralCodeActive ? "Deactivate code" : "Activate code"}
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
