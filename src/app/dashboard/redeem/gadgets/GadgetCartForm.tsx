"use client";

import { useActionState, useMemo, useState } from "react";
import { submitGadgetCartRedemptionAction, updateGadgetCartRedemptionAction, type RedeemState } from "../actions";
import { formatINR } from "@/lib/format";
import { Icon } from "@/components/Icon";

type CatalogueItem = { id: string; name: string; category: string; price: number; available: number };
type CartLine = { gadgetItemId: string; quantity: number };

export default function GadgetCartForm({
  catalogue,
  availableMargin,
  initialCart,
  editingRequestId,
}: {
  catalogue: CatalogueItem[];
  availableMargin: number;
  initialCart: CartLine[];
  editingRequestId?: string;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const line of initialCart) map[line.gadgetItemId] = line.quantity;
    return map;
  });
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const visibleCatalogue = useMemo(() => {
    const query = appliedSearch.trim().toLowerCase();
    if (!query) return catalogue;
    return catalogue.filter(
      (item) => item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query),
    );
  }, [catalogue, appliedSearch]);

  const action = editingRequestId
    ? updateGadgetCartRedemptionAction.bind(null, editingRequestId)
    : submitGadgetCartRedemptionAction;
  const [state, formAction, pending] = useActionState<RedeemState, FormData>(action, undefined);

  const cart = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([gadgetItemId, quantity]) => ({ gadgetItemId, quantity })),
    [quantities],
  );
  const total = useMemo(() => {
    return cart.reduce((sum, line) => {
      const item = catalogue.find((c) => c.id === line.gadgetItemId);
      return sum + (item ? item.price * line.quantity : 0);
    }, 0);
  }, [cart, catalogue]);
  const shortfall = Math.max(0, total - availableMargin);

  function setQuantity(gadgetItemId: string, quantity: number) {
    setQuantities((prev) => ({ ...prev, [gadgetItemId]: Math.max(0, quantity) }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="cart" value={JSON.stringify(cart)} />

      <div className="flex items-center gap-2 rounded-xl bg-surface-container-lowest p-3 shadow-sm">
        <div className="flex h-11 flex-1 items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-low px-3">
          <label className="sr-only" htmlFor="gadget-search">
            Search gadgets by name or category
          </label>
          <input
            id="gadget-search"
            type="text"
            value={searchInput}
            onChange={(e) => {
              const value = e.target.value;
              setSearchInput(value);
              if (value === "") setAppliedSearch("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setAppliedSearch(searchInput);
              }
            }}
            placeholder="Search gadgets..."
            className="w-full bg-transparent text-sm font-medium text-on-surface placeholder:text-on-surface-variant focus:outline-none"
          />
          {searchInput ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchInput("");
                setAppliedSearch("");
              }}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setAppliedSearch(searchInput)}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-container"
        >
          <Icon name="search" className="text-[18px]" />
          Search
        </button>
      </div>

      {visibleCatalogue.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-6 text-center shadow-sm">
          <p className="text-sm text-on-surface-variant">No gadgets match your search.</p>
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setAppliedSearch("");
            }}
            className="min-h-touch rounded-xl bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-container"
          >
            Clear Search
          </button>
        </div>
      ) : (
      <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1">
        {visibleCatalogue.map((item) => {
          const qty = quantities[item.id] ?? 0;
          const outOfStock = item.available <= 0;
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
              <div className="min-w-0">
                <p className="font-medium text-primary">{item.name}</p>
                <p className="text-sm text-on-surface-variant">
                  {item.category} · {formatINR(item.price)} · {outOfStock ? "Out of stock" : `${item.available} in stock`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={outOfStock || qty <= 0}
                  onClick={() => setQuantity(item.id, qty - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-on-surface disabled:opacity-40"
                  aria-label={`Decrease ${item.name} quantity`}
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={item.available}
                  value={qty}
                  disabled={outOfStock}
                  onChange={(e) => setQuantity(item.id, Math.min(item.available, Number(e.target.value) || 0))}
                  className="min-h-touch w-14 rounded-lg border border-outline-variant bg-surface-container-low text-center text-on-surface"
                  aria-label={`${item.name} quantity`}
                />
                <button
                  type="button"
                  disabled={outOfStock || qty >= item.available}
                  onClick={() => setQuantity(item.id, qty + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-on-surface disabled:opacity-40"
                  aria-label={`Increase ${item.name} quantity`}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      )}

      <div className="flex flex-col gap-1 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <p className="text-sm text-on-surface-variant">
          Selected items: <span className="font-medium text-on-surface">{cart.reduce((n, l) => n + l.quantity, 0)}</span>
        </p>
        <p className="text-sm text-on-surface-variant">
          Total requested amount: <span className="font-semibold text-primary">{formatINR(total)}</span>
        </p>
        <p className="text-sm text-on-surface-variant">
          Available Margin: <span className="font-medium text-on-surface">{formatINR(availableMargin)}</span>
        </p>
        {shortfall > 0 && (
          <p className="text-sm font-medium text-amber-800">
            Shortfall Amount: {formatINR(shortfall)} — request will await shortfall resolution.
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-on-surface">Comments (optional)</span>
        <textarea
          name="comments"
          rows={3}
          className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-on-surface transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </label>

      {state?.error && <p className="text-sm text-error">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || cart.length === 0}
        className="flex min-h-touch w-fit items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50"
      >
        {pending ? "Submitting..." : editingRequestId ? "Update request" : "Submit request"}
      </button>
    </form>
  );
}
