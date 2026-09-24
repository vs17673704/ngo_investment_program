import { RefundPanel } from "./RefundPanel";

export default function RefundPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-2 rounded-xl bg-surface-container-lowest p-6 shadow-sm">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Request a Refund</h1>
      <RefundPanel />
    </div>
  );
}
