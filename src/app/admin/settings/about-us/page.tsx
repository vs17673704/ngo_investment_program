import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";
import { AddSectionForm } from "./AddSectionForm";
import { SectionEditor } from "./SectionEditor";
import { PublishButton } from "./PublishButton";
import { MAX_ABOUT_US_SECTIONS } from "@/lib/validation/about-us";

export default async function AdminAboutUsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [sections, publishedCount, latestPublished] = await Promise.all([
    prisma.aboutUsSectionDraft.findMany({ orderBy: { order: "asc" } }),
    prisma.aboutUsSectionPublished.count(),
    prisma.aboutUsSectionPublished.findFirst({ orderBy: { publishedAt: "desc" } }),
  ]);
  const isPublished = publishedCount > 0;
  const atMax = sections.length >= MAX_ABOUT_US_SECTIONS;

  return (
    <>
      <AdminPageHeader title="About Us" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">
          {isPublished
            ? `Published ${latestPublished!.publishedAt.toLocaleString()}.`
            : "Nothing published yet — the public About Us page won't be reachable until you publish."}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/settings/about-us/preview"
            className="flex min-h-touch items-center justify-center gap-1 rounded-lg border border-surface-container-high px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            <Icon name="visibility" className="text-[18px]" />
            Preview draft
          </Link>
          <PublishButton />
        </div>
      </div>

      <div className="flex max-w-xl flex-col gap-3">
        {sections.map((s, i) => (
          <SectionEditor
            key={s.id}
            id={s.id}
            heading={s.heading}
            body={s.body}
            isFirst={i === 0}
            isLast={i === sections.length - 1}
          />
        ))}
      </div>

      <div className="max-w-xl rounded-xl bg-surface-container-lowest p-6 shadow-sm">
        {atMax ? (
          <p className="text-sm text-on-surface-variant">
            Maximum of {MAX_ABOUT_US_SECTIONS} sections reached. Remove a section to add another.
          </p>
        ) : (
          <AddSectionForm />
        )}
      </div>
    </>
  );
}
