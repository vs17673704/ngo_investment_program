"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import CreatePlanForm from "./CreatePlanForm";
import { ManageAmountsForm } from "./ManageAmountsForm";
import { ManageCadencesForm } from "./ManageCadencesForm";
import type { Cadence } from "@/lib/range-generator";

// Each of Plan Management's three forms (Create Plan / Manage Instalment
// Amounts / Manage Payment Durations) opens in its own popup rather than
// sitting inline on the page — DialogButton renders the trigger + its Modal
// together and closes on a successful submit via the form's onSuccess.
function DialogButton({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        {children(() => setOpen(false))}
      </Modal>
    </>
  );
}

export function CreatePlanDialog({ interestMethods }: { interestMethods: { id: string; name: string }[] }) {
  return (
    <DialogButton label="Create Plan" title="Create Plan">
      {(close) => <CreatePlanForm interestMethods={interestMethods} onSuccess={close} />}
    </DialogButton>
  );
}

export function ManageAmountsDialog({
  plans,
}: {
  plans: { id: string; name: string; presetAmounts: number[] }[];
}) {
  return (
    <DialogButton label="Manage Instalment Amounts" title="Manage Instalment Amounts">
      {(close) => <ManageAmountsForm plans={plans} onSuccess={close} />}
    </DialogButton>
  );
}

export function ManageCadencesDialog({
  plans,
}: {
  plans: { id: string; name: string; paymentCadences: Cadence[] }[];
}) {
  return (
    <DialogButton label="Manage Payment Durations" title="Manage Payment Durations">
      {(close) => <ManageCadencesForm plans={plans} onSuccess={close} />}
    </DialogButton>
  );
}
