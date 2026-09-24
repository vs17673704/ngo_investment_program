import { prisma } from "@/lib/prisma";

// BRD Rule XXXIX.7 — proposed default anti-spam thresholds, enforced
// server-side. Backed by the GeneralEnquiry table itself (not an in-memory
// store) so limits hold up across dev-server restarts and multiple instances.
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_SUBMISSIONS = 5;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_MAX_SUBMISSIONS = 3;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export type AntiSpamCheck =
  | { allowed: true; duplicate: false }
  | { allowed: true; duplicate: true }
  | { allowed: false; reason: "ip_throttle" | "email_throttle" };

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function checkGeneralEnquiryAntiSpam(input: {
  ipAddress: string | undefined;
  email: string;
  name: string;
  message: string;
}): Promise<AntiSpamCheck> {
  const now = new Date();

  if (input.ipAddress) {
    const ipCount = await prisma.generalEnquiry.count({
      where: {
        ipAddress: input.ipAddress,
        createdAt: { gte: new Date(now.getTime() - IP_WINDOW_MS) },
      },
    });
    if (ipCount >= IP_MAX_SUBMISSIONS) {
      return { allowed: false, reason: "ip_throttle" };
    }
  }

  const emailCount = await prisma.generalEnquiry.count({
    where: {
      email: input.email,
      createdAt: { gte: new Date(now.getTime() - EMAIL_WINDOW_MS) },
    },
  });
  if (emailCount >= EMAIL_MAX_SUBMISSIONS) {
    return { allowed: false, reason: "email_throttle" };
  }

  if (input.ipAddress) {
    const recentDuplicate = await prisma.generalEnquiry.findFirst({
      where: {
        ipAddress: input.ipAddress,
        email: input.email,
        createdAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (
      recentDuplicate &&
      normalize(recentDuplicate.name) === normalize(input.name) &&
      normalize(recentDuplicate.message) === normalize(input.message)
    ) {
      return { allowed: true, duplicate: true };
    }
  }

  return { allowed: true, duplicate: false };
}
