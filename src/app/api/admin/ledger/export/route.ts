import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resolveLedgerUser, buildLedgerWhere } from "@/lib/ledger";
import { toCsv, type ReportColumn } from "@/lib/reports/export";

const COLUMNS: ReportColumn[] = [
  { key: "id", label: "Ledger Entry ID" },
  { key: "userEmail", label: "User Email" },
  { key: "transactionType", label: "Type" },
  { key: "amount", label: "Amount" },
  { key: "balanceBefore", label: "Balance Before" },
  { key: "balanceAfter", label: "Balance After" },
  { key: "description", label: "Description" },
  { key: "transactionTimestamp", label: "Transaction Date" },
];

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const email = params.get("email") ?? undefined;
  const type = params.get("type") ?? undefined;
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;

  const user = await resolveLedgerUser(email);
  if (email?.trim() && !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const where = buildLedgerWhere(user?.id, { type, from, to });
  const entries = await prisma.ledgerEntry.findMany({
    where,
    orderBy: { transactionTimestamp: "desc" },
    include: { user: true },
  });

  const rows = entries.map((e) => ({
    id: e.id,
    userEmail: e.user.email,
    transactionType: e.transactionType,
    amount: e.amount,
    balanceBefore: e.balanceBefore,
    balanceAfter: e.balanceAfter,
    description: e.description,
    transactionTimestamp: e.transactionTimestamp,
  }));

  const csv = toCsv(rows, COLUMNS);
  const filenameBase = `ledger-${user?.email ?? "all-users"}-${new Date().toISOString().slice(0, 10)}`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
    },
  });
}
