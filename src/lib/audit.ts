import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type LogAuditInput = {
  actorUserId?: string;
  eventType: string;
  entityRef?: string;
  details?: Prisma.InputJsonValue;
};

export async function logAudit(input: LogAuditInput) {
  return prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      entityRef: input.entityRef,
      details: input.details,
    },
  });
}
