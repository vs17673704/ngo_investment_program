"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";

// Generic popup dialog for turning an inline form into a "click a button to
// open it" flow (e.g. admin/plans' Create Plan / Manage Instalment Amounts /
// Manage Payment Durations forms). Portaled to document.body for the same
// reason as ShellMobileNav's drawer — an ancestor header's backdrop-blur
// would otherwise reposition a `position: fixed` descendant relative to
// itself instead of the viewport.
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close dialog" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
          >
            <Icon name="close" className="text-[22px]" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
