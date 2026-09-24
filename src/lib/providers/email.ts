import { prisma } from "@/lib/prisma";

// Master Prompt.md §18: simulated email provider. Never call a real SMTP/API.
// Generated emails are persisted and viewable via the prototype email viewer
// at /admin/emails instead of being sent.

export type QueueEmailInput = {
  recipient: string;
  subject: string;
  body: string;
  templateType: string;
  relatedEntityRef?: string;
};

export async function queueEmail(input: QueueEmailInput) {
  return prisma.emailMessage.create({
    data: {
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      templateType: input.templateType,
      relatedEntityRef: input.relatedEntityRef,
      status: "SENT", // simulated: always "delivered" instantly
    },
  });
}
