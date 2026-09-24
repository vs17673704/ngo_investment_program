import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { AuditLogList } from "./AuditLogList";

export default async function AdminAuditLogPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const entries = await prisma.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 200,
    include: { actor: true },
  });

  return (
    <>
      <AdminPageHeader title="Audit Log" />

      <AuditLogList
        entries={entries.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          actorEmail: e.actor?.email ?? "system",
          entityRef: e.entityRef,
          timestamp: e.timestamp.toLocaleString(),
          detailsJson: e.details ? JSON.stringify(e.details, null, 2) : null,
        }))}
      />
    </>
  );
}
