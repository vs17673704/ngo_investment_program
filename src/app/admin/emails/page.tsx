import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const { id } = await searchParams;

  const [emails, selected] = await Promise.all([
    prisma.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    id ? prisma.emailMessage.findUnique({ where: { id } }) : Promise.resolve(null),
  ]);

  return (
    <>
      <AdminPageHeader title="Simulated Email Outbox" />
      <p className="text-sm text-on-surface-variant">
        {emails.length} email(s) queued/sent by the simulated mailer. No real emails are sent.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
          {emails.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Icon name="mail" className="text-[32px] text-on-surface-variant" />
              <p className="text-sm text-on-surface-variant">No emails yet.</p>
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-surface-container overflow-y-auto">
              {emails.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/admin/emails?id=${e.id}`}
                    className={`block px-4 py-3 text-sm transition-colors hover:bg-surface-container ${
                      id === e.id ? "bg-surface-container" : ""
                    }`}
                  >
                    <p className="font-medium text-primary">{e.subject}</p>
                    <p className="text-on-surface-variant">
                      To: {e.recipient} · {e.templateType} · {e.status} · {e.createdAt.toLocaleString()}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
          {selected ? (
            <>
              <p className="text-xs text-on-surface-variant">To: {selected.recipient}</p>
              <p className="text-xs text-on-surface-variant">Template: {selected.templateType}</p>
              <p className="text-xs text-on-surface-variant">Status: {selected.status}</p>
              <h2 className="mt-2 font-heading text-lg font-semibold text-primary">{selected.subject}</h2>
              <div className="mt-3 rounded-lg bg-surface-container-low p-3 text-sm whitespace-pre-wrap text-on-surface">
                {selected.body}
              </div>
            </>
          ) : (
            <p className="text-sm text-on-surface-variant">Select an email to preview its content.</p>
          )}
        </div>
      </div>
    </>
  );
}
