"use server";

import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { emitAdminEvent } from "@/lib/events/admin-events";
import { queueEmail } from "@/lib/providers/email";
import { createNotification } from "@/lib/providers/notification";
import { generalEnquirySchema } from "@/lib/validation/general-enquiry";
import { checkGeneralEnquiryAntiSpam } from "@/lib/general-enquiry-antispam";

export type GeneralEnquiryFormState = { error?: string; enquiryId?: string } | undefined;

// BRD Rule XXXIX.5-XXXIX.7: submission is allowed anonymously; no account is
// created for an anonymous submitter, and a mandatory hidden honeypot field
// is rejected silently (as if the enquiry succeeded) so the anti-spam
// mechanism is never revealed to whoever/whatever filled it in.
export async function submitGeneralEnquiryAction(
  _prev: GeneralEnquiryFormState,
  formData: FormData,
): Promise<GeneralEnquiryFormState> {
  const session = await getSession();

  const parsed = generalEnquirySchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    message: formData.get("message"),
    website: formData.get("website") || undefined,
  });

  if (!parsed.success) {
    const isHoneypot = parsed.error.issues.some((issue) => issue.path[0] === "website");
    if (isHoneypot) {
      // Silently pretend success — never reveal the honeypot to the caller.
      return { enquiryId: "REF-0000" };
    }
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  const headerList = await headers();
  const ipAddress = headerList.get("x-forwarded-for") ?? undefined;

  const spamCheck = await checkGeneralEnquiryAntiSpam({
    ipAddress,
    email: data.email,
    name: data.name,
    message: data.message,
  });

  if (!spamCheck.allowed) {
    return { error: "Too many submissions. Please try again later." };
  }

  if (spamCheck.duplicate) {
    // Rule XXXIX.7: suppress the duplicate without creating a second record,
    // but still confirm to the submitter as if it went through.
    return { enquiryId: "REF-DUPLICATE" };
  }

  const enquiry = await prisma.generalEnquiry.create({
    data: {
      userId: session?.sub,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      message: data.message,
      ipAddress,
    },
  });

  await logAudit({
    actorUserId: session?.sub,
    eventType: "GENERAL_ENQUIRY_SUBMITTED",
    entityRef: enquiry.id,
    details: { source: enquiry.source },
  });

  emitAdminEvent({
    type: "general_enquiry.submitted",
    message: `New general enquiry submitted by ${data.name}`,
    details: { enquiryId: enquiry.id },
  });

  // Master Prompt.md §33/§35: General Enquiry Received pushes to Admin via
  // a durable Notification row (which createNotification also delivers over
  // real FCM), in addition to the existing simulated admin email.
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true } });
  await Promise.all(
    admins.flatMap((admin) => [
      queueEmail({
        recipient: admin.email,
        subject: "New General Enquiry Received",
        body: `A new general enquiry was submitted by ${data.name} (${data.email}).\n\n${data.message}`,
        templateType: "GENERAL_ENQUIRY_RECEIVED",
        relatedEntityRef: enquiry.id,
      }),
      createNotification({
        userId: admin.id,
        type: "GENERAL_ENQUIRY_RECEIVED",
        title: "New General Enquiry Received",
        message: `${data.name} (${data.email}) submitted a new general enquiry.`,
        relatedEntityRef: enquiry.id,
      }),
    ]),
  );

  return { enquiryId: enquiry.id };
}
