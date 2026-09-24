import { ReinvestmentPanel } from "./ReinvestmentPanel";

export default function ReinvestmentPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-2 rounded-xl bg-surface-container-lowest p-6 shadow-sm">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Reinvest Redeemable Balance</h1>
      <ReinvestmentPanel />
    </div>
  );
}
