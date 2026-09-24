import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";
import { ContactUsForm } from "./ContactUsForm";
import { PublishButton } from "./PublishButton";
import type { SocialLink } from "@/lib/validation/contact-us";

export default async function AdminContactUsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const content = await prisma.contactUsContent.findFirst();
  const isPublished = Boolean(content?.publishedAt);

  return (
    <>
      <AdminPageHeader title="Contact Us" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">
          {isPublished
            ? `Published ${content!.publishedAt!.toLocaleString()}.`
            : "Nothing published yet — the public Contact Us page won't show any contact details until you publish."}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/settings/contact-us/preview"
            className="flex min-h-touch items-center justify-center gap-1 rounded-lg border border-surface-container-high px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            <Icon name="visibility" className="text-[18px]" />
            Preview draft
          </Link>
          <PublishButton />
        </div>
      </div>

      <div className="max-w-xl rounded-xl bg-surface-container-lowest p-6 shadow-sm">
        <ContactUsForm
          address={content?.draftAddress ?? null}
          phone={content?.draftPhone ?? null}
          email={content?.draftEmail ?? null}
          website={content?.draftWebsite ?? null}
          socialLinks={(content?.draftSocialLinks as SocialLink[] | null) ?? []}
        />
      </div>
    </>
  );
}
