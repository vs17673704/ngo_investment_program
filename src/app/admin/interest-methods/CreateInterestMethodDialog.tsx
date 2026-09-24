"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import CreateInterestMethodForm from "./CreateInterestMethodForm";

// Mirrors Plan Management's popup treatment (PlanFormDialogs.tsx): the form
// opens in its own popup rather than sitting inline on the page, and closes
// on a successful submit via the form's onSuccess.
export function CreateInterestMethodDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Create Interest Method
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create Interest Method">
        <CreateInterestMethodForm onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}
