import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { reportDefinitions } from "@/lib/reports";
import { AdminPageHeader } from "@/components/AdminPageHeader";

const FORMATS: { format: string; label: string }[] = [
  { format: "csv", label: "CSV" },
  { format: "xlsx", label: "Excel" },
  { format: "pdf", label: "PDF" },
];

export default async function AdminReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  return (
    <>
      <AdminPageHeader title="Reports & Exports" />
      <p className="text-sm text-on-surface-variant">
        Download the latest data for each report in CSV, Excel, or PDF format.
      </p>
      <ul className="flex flex-col gap-2">
        {reportDefinitions.map((report) => (
          <li
            key={report.key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm"
          >
            <span className="font-medium text-primary">{report.label}</span>
            <span className="flex gap-2">
              {FORMATS.map(({ format, label }) => (
                <a
                  key={format}
                  href={`/api/admin/reports/${report.key}?format=${format}`}
                  className="flex min-h-touch items-center justify-center rounded-lg border border-surface-container-high px-3 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                >
                  {label}
                </a>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
