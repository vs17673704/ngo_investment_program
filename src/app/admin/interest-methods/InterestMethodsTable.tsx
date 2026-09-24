"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { SearchProgressBar } from "@/components/SearchProgressBar";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import EditInterestMethodForm from "./EditInterestMethodForm";

const FORMULA_LABEL: Record<string, string> = {
  SIMPLE: "Simple Interest",
  COMPOUND: "Compound Interest",
  CUSTOM: "Custom Formula",
};

type MethodRow = {
  id: string;
  name: string;
  formulaType: "SIMPLE" | "COMPOUND" | "CUSTOM";
  compoundingFrequency: string | null;
  customFormula: string | null;
  ratePercent: string;
  tenureMonths: number;
  dayCountBasis: string;
  version: number;
  active: boolean;
  previousVersionId: string | null;
  plansUsing: number;
};

export function InterestMethodsTable({ methods }: { methods: MethodRow[] }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredMethods = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return methods;
    return methods.filter(
      (m) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query),
    );
  }, [methods, q]);

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
              placeholder="Name or method ID"
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

      <div className="max-h-[28rem] overflow-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-surface-container-high bg-surface-container-lowest text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
            <tr>
              <th className="px-4 py-3">Method ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Tenure</th>
              <th className="px-4 py-3">Day count</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Plans using</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {filteredMethods.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-3 text-on-surface-variant">
                  No matching interest methods.
                </td>
              </tr>
            )}
            {filteredMethods.map((m) => (
              <Fragment key={m.id}>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">{m.id}</td>
                  <td className="px-4 py-3 font-medium text-primary">{m.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {FORMULA_LABEL[m.formulaType] ?? m.formulaType}
                    {m.formulaType === "COMPOUND" && m.compoundingFrequency && (
                      <span className="block text-xs">{m.compoundingFrequency}</span>
                    )}
                    {m.formulaType === "CUSTOM" && m.customFormula && (
                      <span className="block font-mono text-xs">{m.customFormula}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{m.ratePercent}%</td>
                  <td className="px-4 py-3 text-on-surface-variant">{m.tenureMonths} mo</td>
                  <td className="px-4 py-3 text-on-surface-variant">{m.dayCountBasis}</td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    v{m.version}
                    {m.previousVersionId && <span className="block text-xs">supersedes prior version</span>}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{m.plansUsing}</td>
                  <td className="px-4 py-3">
                    {m.active ? (
                      <Badge tone="info" size="sm">Active</Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">Superseded</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.active && (
                      <button
                        type="button"
                        onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {editingId === m.id ? "Close" : "Edit"}
                      </button>
                    )}
                  </td>
                </tr>
                {editingId === m.id && (
                  <tr>
                    <td colSpan={10} className="bg-surface-container-low px-4 py-4">
                      <EditInterestMethodForm method={m} onDone={() => setEditingId(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
