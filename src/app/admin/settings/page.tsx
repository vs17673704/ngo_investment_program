import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSettings } from "@/lib/config";
import SettingsForm from "./SettingsForm";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const settings = await getSettings();

  return (
    <>
      <AdminPageHeader title="Site Settings" />
      <p className="text-sm text-on-surface-variant">
        These values configure BRD-mandated program parameters (referral validity, redemption
        expiry, payment retry/grace-period behaviour, commission cycle length, and reward
        percentages). Changes apply immediately to all future calculations.
      </p>
      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold text-primary">Website Content</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/settings/about-us"
            className="flex min-h-touch items-center gap-2 rounded-lg border border-surface-container-high px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            <Icon name="info" className="text-[18px]" />
            Manage About Us
          </Link>
          <Link
            href="/admin/settings/contact-us"
            className="flex min-h-touch items-center gap-2 rounded-lg border border-surface-container-high px-4 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            <Icon name="contact_page" className="text-[18px]" />
            Manage Contact Us
          </Link>
        </div>
      </div>

      <div className="max-w-xl rounded-xl bg-surface-container-lowest p-6 shadow-sm">
        <SettingsForm current={settings} />
      </div>
    </>
  );
}
