import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/config";
import { computeNextDeduction } from "@/lib/dashboard";
import { queueEmail } from "@/lib/providers/email";
import { createNotification } from "@/lib/providers/notification";
import { formatINR } from "@/lib/format";

// BRD Rule XXXVIII / Design.md §6.18: Admin-configured lead time before an
// ACTIVE Plan's next scheduled instalment -> Email + FCM Push reminder naming
// the Plan, amount, and date. "No real cron infra" prototype convention
// (matches AutoPay/Retry/Maturity): an admin explicitly triggers this batch
// in place of a scheduled daily job.
//
// Dedup: there is no stored "next due date" field to flag as reminded
// (computeNextDeduction derives it live from principalPaid, per its own
// comment), so this reuses that same derived date as the dedup key via
// relatedEntityRef = `${userPlanId}:${dueDateISODate}` on the
// INSTALMENT_REMINDER Notification row — re-running the batch on the same day
// never sends a duplicate for the same instalment.
//
// Preview list for the admin simulator screen (due count) and reused by
// runInstalmentReminders() below, mirroring findDuePlans/findDuePaymentRetries.
export async function findDueInstalmentReminders() {
  const settings = await getSettings();
  const leadDays = settings.instalmentReminderLeadDays;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + leadDays * 86_400_000);

  // computeNextDeduction only returns non-null for MONTHLY plans still
  // accruing; LUMPSUM has no further deductions after the single upfront
  // payment (see src/lib/dashboard.ts).
  const userPlans = await prisma.userPlan.findMany({
    where: { status: "ACTIVE", paymentFrequency: "MONTHLY" },
    include: { plan: true, user: true },
  });

  const due: { userPlan: (typeof userPlans)[number]; nextDeduction: { amount: number; date: Date }; relatedEntityRef: string }[] = [];

  for (const userPlan of userPlans) {
    const nextDeduction = computeNextDeduction(userPlan);
    if (!nextDeduction) continue;
    if (nextDeduction.date < now || nextDeduction.date > windowEnd) continue;

    const dueDateKey = nextDeduction.date.toISOString().slice(0, 10);
    const relatedEntityRef = `${userPlan.id}:${dueDateKey}`;

    const alreadyReminded = await prisma.notification.findFirst({
      where: { userId: userPlan.userId, type: "INSTALMENT_REMINDER", relatedEntityRef },
    });
    if (alreadyReminded) continue;

    due.push({ userPlan, nextDeduction, relatedEntityRef });
  }

  return due;
}

export async function runInstalmentReminders() {
  const due = await findDueInstalmentReminders();
  const reminded: { userPlanId: string; dueDate: Date }[] = [];

  for (const { userPlan, nextDeduction, relatedEntityRef } of due) {
    const message = `Your next instalment of ${formatINR(nextDeduction.amount)} for ${userPlan.plan.name} is due on ${nextDeduction.date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}.`;

    await queueEmail({
      recipient: userPlan.user.email,
      subject: "Upcoming instalment reminder",
      body: message,
      templateType: "INSTALMENT_REMINDER",
      relatedEntityRef,
    });

    await createNotification({
      userId: userPlan.userId,
      type: "INSTALMENT_REMINDER",
      title: "Upcoming instalment reminder",
      message,
      relatedEntityRef,
    });

    reminded.push({ userPlanId: userPlan.id, dueDate: nextDeduction.date });
  }

  return reminded;
}
