import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/config";

// BRD Rule XXXIX.8: retention/deletion is a controlled, audited, PII-protective
// action, not a real background cron (Master Prompt: no real cron/queue infra
// in this prototype) — an admin explicitly triggers this batch, matching the
// existing AutoPay/payment-retry/maturity batch convention in
// src/app/admin/payments/actions.ts. Anonymization (not row deletion) keeps
// Enquiry Report counts/history intact per BRD's "reporting-aware" requirement.
const REDACTED_NAME = "[REDACTED]";
const REDACTED_EMAIL = "redacted@redacted.invalid";

export async function runGeneralEnquiryRetention(): Promise<{ anonymizedCount: number }> {
  const { generalEnquiryRetentionMonths } = await getSettings();

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - generalEnquiryRetentionMonths);

  const due = await prisma.generalEnquiry.findMany({
    where: { createdAt: { lte: cutoff }, anonymizedAt: null },
    select: { id: true },
  });

  if (due.length === 0) {
    return { anonymizedCount: 0 };
  }

  await prisma.generalEnquiry.updateMany({
    where: { id: { in: due.map((e) => e.id) } },
    data: {
      name: REDACTED_NAME,
      email: REDACTED_EMAIL,
      phone: null,
      ipAddress: null,
      anonymizedAt: new Date(),
    },
  });

  return { anonymizedCount: due.length };
}
