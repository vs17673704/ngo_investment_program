import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SiteNav } from "@/components/SiteNav";
import { DashboardShell } from "@/components/DashboardShell";
import { getUserDashboardData } from "@/lib/dashboard";

export default async function AboutPage() {
  const [session, sections] = await Promise.all([
    getSession(),
    prisma.aboutUsSectionPublished.findMany({ orderBy: { order: "asc" } }),
  ]);

  // Design.md 5.13.C: empty/unconfigured content means public About Us stays
  // hidden entirely (404), matching the draft-never-leaks guarantee.
  if (sections.length === 0) notFound();

  const content = (
    <>
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-on-surface md:text-4xl">About Us</h1>
      </div>
      <div className="flex flex-col gap-8">
        {sections.map((s) => (
          <section key={s.id}>
            {s.heading && (
              <h2 className="mb-2 font-heading text-xl font-semibold text-primary">{s.heading}</h2>
            )}
            <p className="whitespace-pre-wrap text-base leading-relaxed text-on-surface-variant">{s.body}</p>
          </section>
        ))}
      </div>
    </>
  );

  if (session && session.role === "USER") {
    const data = await getUserDashboardData(session.sub);
    return (
      <DashboardShell
        email={data.user.email}
        referralCode={data.user.referralCode}
        unreadNotificationCount={data.unreadNotificationCount}
      >
        <div className="mx-auto w-full max-w-3xl flex-1">{content}</div>
      </DashboardShell>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">{content}</main>
    </div>
  );
}
