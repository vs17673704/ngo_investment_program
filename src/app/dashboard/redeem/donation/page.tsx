import { DonationPanel } from "./DonationPanel";

export default function DonationPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-2 rounded-xl bg-surface-container-lowest p-6 shadow-sm">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Donate</h1>
      <DonationPanel />
    </div>
  );
}
