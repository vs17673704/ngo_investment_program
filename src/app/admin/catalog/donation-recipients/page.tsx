import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CreateDonationRecipientForm, ToggleDonationRecipientActiveButton } from "../Forms";
import { AdminPageHeader } from "@/components/AdminPageHeader";

export default async function AdminDonationRecipientsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const recipients = await prisma.donationRecipient.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <AdminPageHeader title="Donation Recipients" />
      <section className="flex flex-col gap-3">
        <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
          <CreateDonationRecipientForm />
        </div>
        {recipients.length === 0 ? (
          <div className="rounded-xl bg-surface-container-lowest p-4 text-sm text-on-surface-variant shadow-sm">
            No donation recipients yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recipients.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 text-sm text-on-surface shadow-sm"
              >
                <span>
                  {r.name}
                  {!r.active && <span className="ml-2 text-xs text-on-surface-variant">(inactive)</span>}
                </span>
                <ToggleDonationRecipientActiveButton recipientId={r.id} active={r.active} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
