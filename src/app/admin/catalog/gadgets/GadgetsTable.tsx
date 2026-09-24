"use client";

import { useMemo, useRef, useState } from "react";
import { AdjustStockForm } from "../Forms";
import { SearchProgressBar } from "@/components/SearchProgressBar";
import { Icon } from "@/components/Icon";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

type GadgetRow = {
  id: string;
  category: string;
  name: string;
  price: string;
  stockQuantity: number;
  reservedQuantity: number;
};

export function GadgetsTable({ gadgets }: { gadgets: GadgetRow[] }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredGadgets = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return gadgets;
    return gadgets.filter(
      (g) => g.name.toLowerCase().includes(query) || g.category.toLowerCase().includes(query),
    );
  }, [gadgets, q]);

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
              placeholder="Name or category"
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
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-surface-container-high bg-surface-container-lowest text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
            <tr>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Reserved</th>
              <th className="px-4 py-3">Adjust stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {filteredGadgets.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-on-surface-variant">
                  {q.trim() ? "No matching gadgets." : "No gadgets yet."}
                </td>
              </tr>
            )}
            {filteredGadgets.map((g) => (
              <tr key={g.id}>
                <td className="px-4 py-3 text-on-surface-variant">{g.category}</td>
                <td className="px-4 py-3 font-medium text-primary">{g.name}</td>
                <td className="px-4 py-3 text-on-surface-variant">₹{g.price}</td>
                <td className="px-4 py-3 text-on-surface-variant">{g.stockQuantity}</td>
                <td className="px-4 py-3 text-on-surface-variant">{g.reservedQuantity}</td>
                <td className="px-4 py-3">
                  <AdjustStockForm gadgetId={g.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
