import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";
import type { SocialLink } from "@/lib/validation/contact-us";

export default async function AdminContactUsPreviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const content = await prisma.contactUsContent.findFirst();
  const socialLinks = (content?.draftSocialLinks as SocialLink[] | null) ?? [];
  const details = [
    { label: "Address", value: content?.draftAddress },
    { label: "Phone", value: content?.draftPhone },
    { label: "Email", value: content?.draftEmail },
    { label: "Website", value: content?.draftWebsite },
  ].filter((d) => d.value);

  return (
    <>
      <AdminPageHeader title="Contact Us — Draft Preview" backToAdmin={false} />
      <Link
        href="/admin/settings/contact-us"
        className="flex w-fit items-center gap-1 text-sm font-medium text-on-surface-variant transition-colors hover:text-primary"
      >
        <Icon name="arrow_back" className="text-[18px]" />
        Back to Contact Us settings
      </Link>

      <div className="rounded-xl border-2 border-dashed border-tertiary bg-surface-container-lowest p-6 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-tertiary">
          Draft preview — not published
        </p>
        {details.length === 0 && socialLinks.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No draft contact details yet.</p>
        ) : (
          <dl className="flex flex-col gap-2 text-sm">
            {details.map((d) => (
              <div key={d.label} className="flex gap-2">
                <dt className="font-medium text-on-surface-variant">{d.label}:</dt>
                <dd className="text-on-surface">{d.value}</dd>
              </div>
            ))}
            {socialLinks.length > 0 && (
              <div className="flex gap-2">
                <dt className="font-medium text-on-surface-variant">Social:</dt>
                <dd className="flex flex-wrap gap-3">
                  {socialLinks.map((s) => (
                    <span key={s.url} className="text-primary underline">
                      {s.label}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </>
  );
}
