import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SiteNav } from "@/components/SiteNav";
import { DashboardShell } from "@/components/DashboardShell";
import { getUserDashboardData } from "@/lib/dashboard";
import { GeneralEnquiryForm } from "./GeneralEnquiryForm";
import type { SocialLink } from "@/lib/validation/contact-us";

export default async function ContactPage() {
  const [session, contactUsContent] = await Promise.all([
    getSession(),
    prisma.contactUsContent.findFirst(),
  ]);
  const user = session ? await prisma.user.findUnique({ where: { id: session.sub }, select: { email: true } }) : null;

  // Design.md 1.5/5.13.D: only show configured (non-empty) published fields.
  const socialLinks = (contactUsContent?.publishedSocialLinks as SocialLink[] | null) ?? [];
  const details = [
    { label: "Address", value: contactUsContent?.publishedAddress },
    { label: "Phone", value: contactUsContent?.publishedPhone },
    { label: "Email", value: contactUsContent?.publishedEmail },
    { label: "Website", value: contactUsContent?.publishedWebsite },
  ].filter((d) => d.value);
  const hasContactDetails = details.length > 0 || socialLinks.length > 0;

  const content = (
    <>
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-on-surface md:text-4xl">Contact Us</h1>
        <p className="text-base leading-relaxed text-on-surface-variant">
          Have a question? Send us a general enquiry and our team will get back to you. General enquiries are not
          redemption requests and have no financial impact on your account.
        </p>
      </div>

      {hasContactDetails && (
        <section className="mb-6 rounded-xl bg-surface-container-lowest p-6 shadow-sm">
          <h2 className="mb-4 font-heading text-lg font-semibold text-primary">Contact Details</h2>
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
                    <a
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {s.label}
                    </a>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
        <h2 className="mb-4 font-heading text-lg font-semibold text-primary">Send a General Enquiry</h2>
        <GeneralEnquiryForm defaultEmail={user?.email} />
      </section>
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
