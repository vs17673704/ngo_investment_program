"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui/Modal";

// Unlike the Course/Gadgets/Franchisee tiles (plain `<Link>`s to their own
// page), Refund/Reinvestment/Donation open in-place via local state — no
// navigation, no URL change, no history entry. `children` is the matching
// `*Panel` server component, already rendered server-side and passed down;
// it just stays hidden inside the (closed) `Modal` until the tile is clicked.
export function PopupRedeemTile({
  icon,
  label,
  desc,
  title,
  children,
}: {
  icon: string;
  label: string;
  desc: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl bg-surface-container-lowest p-3 text-left shadow-sm transition-shadow hover:shadow-md"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface">
          <Icon name={icon} className="text-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-primary">{label}</p>
          <p className="truncate text-xs text-on-surface-variant">{desc}</p>
        </div>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        {children}
      </Modal>
    </>
  );
}
