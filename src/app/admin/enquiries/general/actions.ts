"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { runGeneralEnquiryRetention } from "@/lib/general-enquiry-retention";
import { queueEmail } from "@/lib/providers/email";
import { createNotification } from "@/lib/providers/notification";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

export type GeneralEnquiryActionState = { error?: string } | undefined;

// BRD Rule XXXIX.6: NEW -> IN_PROGRESS -> RESOLVED, with RESOLVED reopenable
// back to IN_PROGRESS. This lifecycle is independent of, and never merged
// with, the Redemption Request or Franchisee enquiry lifecycles.
export async function changeGeneralEnquiryStatusAction(
  enquiryId: string,
  _prev: GeneralEnquiryActionState,
  formData: FormData,
): Promise<GeneralEnquiryActionState> {
  const session = await requireAdmin();
  const status = formData.get("status")?.toString() as "NEW" | "IN_PROGRESS" | "RESOLVED" | undefined;
  if (!status || !["NEW", "IN_PROGRESS", "RESOLVED"].includes(status)) {
    return { error: "Invalid status" };
  }
  const comment = formData.get("adminComment")?.toString().trim() || undefined;

  const enquiry = await prisma.generalEnquiry.update({
    where: { id: enquiryId },
    data: {
      status,
      adminComment: comment ?? undefined,
      resolvedAt: status === "RESOLVED" ? new Date() : status === "IN_PROGRESS" ? null : undefined,
      resolvedById: status === "RESOLVED" ? session.sub : status === "IN_PROGRESS" ? null : undefined,
    },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "GENERAL_ENQUIRY_STATUS_CHANGED",
    entityRef: enquiry.id,
    details: { status, adminComment: comment },
  });

  // E2E-11 / BRD Rule XXXIX: the submitter must be informed of the actual
  // resolution content, not just see a status flip on the admin's own queue.
  // Email always goes out (every submitter, anonymous or not, gave an
  // email address); the in-app/push Notification only applies when the
  // enquiry was submitted while logged in (userId set).
  if (status === "RESOLVED") {
    await queueEmail({
      recipient: enquiry.email,
      subject: "Your enquiry has been resolved",
      body: comment
        ? `Your enquiry has been resolved: ${comment}`
        : "Your enquiry has been resolved.",
      templateType: "GENERAL_ENQUIRY_RESOLVED",
      relatedEntityRef: enquiry.id,
    });

    if (enquiry.userId) {
      await createNotification({
        userId: enquiry.userId,
        type: "ADMIN_MESSAGE",
        title: "Your enquiry has been resolved",
        message: comment ?? "Your enquiry has been resolved.",
        relatedEntityRef: enquiry.id,
      });
    }
  }

  revalidatePath("/admin/enquiries/general");
}

// BRD Rule XXXIX.8: admin-triggered retention batch (stands in for a scheduled
// job — no real cron infra in this prototype, matching the AutoPay/maturity
// batch convention). Anonymizes PII on enquiries past the configured
// retention window; the audited count is the evidence, not a UI claim.
export async function runGeneralEnquiryRetentionAction(): Promise<void> {
  const session = await requireAdmin();

  const { anonymizedCount } = await runGeneralEnquiryRetention();

  await logAudit({
    actorUserId: session.sub,
    eventType: "GENERAL_ENQUIRY_RETENTION_RUN",
    entityRef: `count:${anonymizedCount}`,
  });

  revalidatePath("/admin/enquiries/general");
}
