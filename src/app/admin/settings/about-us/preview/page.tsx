import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";

export default async function AdminAboutUsPreviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const sections = await prisma.aboutUsSectionDraft.findMany({ orderBy: { order: "asc" } });

  return (
    <>
      <AdminPageHeader title="About Us — Draft Preview" backToAdmin={false} />
      <Link
        href="/admin/settings/about-us"
        className="flex w-fit items-center gap-1 text-sm font-medium text-on-surface-variant transition-colors hover:text-primary"
      >
        <Icon name="arrow_back" className="text-[18px]" />
        Back to About Us settings
      </Link>

      <div className="rounded-xl border-2 border-dashed border-tertiary bg-surface-container-lowest p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-tertiary">
          Draft preview — not published
        </p>
        {sections.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No draft sections yet.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {sections.map((s) => (
              <div key={s.id}>
                {s.heading && (
                  <h2 className="mb-2 font-heading text-lg font-semibold text-on-surface">{s.heading}</h2>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">{s.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
