"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CreateFranchiseePlanForm } from "../Forms";

// Mirrors admin/plans' DialogButton (PlanFormDialogs.tsx): a "Create Plan"
// style trigger button that opens the create form inside a Modal and closes
// on a successful submit, instead of the form sitting inline on the page.
export function CreateFranchiseePlanDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Create Franchisee Plan
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create Franchisee Plan">
        <CreateFranchiseePlanForm onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}
