import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";
import { EnquiryStatusForm } from "./EnquiryStatusForm";
import { runGeneralEnquiryRetentionAction } from "./actions";
import { getSettings } from "@/lib/config";
import { SearchFieldWithClear } from "@/components/SearchFieldWithClear";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const STATUS_FILTERS = ["ALL", "NEW", "IN_PROGRESS", "RESOLVED"] as const;

export default async function AdminGeneralEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const { status, q } = await searchParams;
  const activeStatus = STATUS_FILTERS.includes(status as (typeof STATUS_FILTERS)[number])
    ? (status as (typeof STATUS_FILTERS)[number])
    : "ALL";

  const where: Prisma.GeneralEnquiryWhereInput = {};
  if (activeStatus !== "ALL") where.status = activeStatus;
  if (q?.trim()) {
    where.OR = [
      { name: { contains: q.trim(), mode: "insensitive" } },
      { email: { contains: q.trim(), mode: "insensitive" } },
      { message: { contains: q.trim(), mode: "insensitive" } },
    ];
  }

  const [enquiries, { generalEnquiryRetentionMonths }] = await Promise.all([
    prisma.generalEnquiry.findMany({
      where,
      include: { resolvedBy: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    getSettings(),
  ]);

  return (
    <>
      <AdminPageHeader title="General Enquiries" />
      <Card className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-on-surface-variant">
          Enquiries older than the configured retention period ({generalEnquiryRetentionMonths}{" "}
          months, configurable in Site Settings) have their Name/Email/Phone anonymized when this batch is run.
        </p>
        <form action={runGeneralEnquiryRetentionAction}>
          <button type="submit" className={buttonStyles("secondary")}>
            Run retention cleanup
          </button>
        </form>
      </Card>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <SearchFieldWithClear id="q" name="q" label="Search" defaultValue={q} placeholder="Name, email, or message" />
        <button type="submit" className={buttonStyles("primary")}>
          Search
        </button>
        <AutoSubmitSelect
          id="status"
          name="status"
          label="Status"
          defaultValue={activeStatus}
          options={STATUS_FILTERS.map((s) => ({ value: s, label: s === "ALL" ? "All" : s }))}
        />
      </form>

      {enquiries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
          <Icon name="contact_support" className="text-[32px] text-on-surface-variant" />
          <p className="text-sm text-on-surface-variant">No general enquiries yet.</p>
        </div>
      ) : (
        <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
          {enquiries.map((e) => (
            <Card as="li" key={e.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-primary">
                    {e.name} · {e.email}
                    {e.phone ? ` · ${e.phone}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-on-surface-variant">{e.message}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    ID {e.id} · Source {e.source} · Created {e.createdAt.toLocaleString()}
                    {e.updatedAt.getTime() !== e.createdAt.getTime()
                      ? ` · Updated ${e.updatedAt.toLocaleString()}`
                      : ""}
                    {e.resolvedAt ? ` · Resolved ${e.resolvedAt.toLocaleString()}` : ""}
                    {e.resolvedBy ? ` by ${e.resolvedBy.email}` : ""}
                    {e.anonymizedAt ? ` · PII anonymized ${e.anonymizedAt.toLocaleString()}` : ""}
                  </p>
                </div>
                <Badge tone="success">{e.status}</Badge>
              </div>
              <EnquiryStatusForm enquiryId={e.id} currentStatus={e.status} currentComment={e.adminComment} />
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
