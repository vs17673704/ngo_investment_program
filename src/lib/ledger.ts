import type { LedgerTransactionType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type LedgerFilters = {
  email?: string;
  type?: string;
  from?: string;
  to?: string;
};

export async function resolveLedgerUser(email?: string) {
  const trimmed = email?.trim();
  if (!trimmed) return null;
  return prisma.user.findFirst({ where: { email: { equals: trimmed, mode: "insensitive" } } });
}

export function buildLedgerWhere(
  userId: string | undefined,
  filters: Pick<LedgerFilters, "type" | "from" | "to">,
): Prisma.LedgerEntryWhereInput {
  const { type, from, to } = filters;
  const transactionTimestamp: Prisma.DateTimeFilter = {};
  if (from) transactionTimestamp.gte = new Date(from);
  if (to) transactionTimestamp.lte = new Date(to);

  return {
    ...(userId ? { userId } : {}),
    ...(type && type !== "ALL" ? { transactionType: type as LedgerTransactionType } : {}),
    ...(from || to ? { transactionTimestamp } : {}),
  };
}
