import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { reportsByKey } from "@/lib/reports";
import { toCsv, toXlsxBuffer, toPdfBuffer } from "@/lib/reports/export";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportKey: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { reportKey } = await params;
  const report = reportsByKey[reportKey];
  if (!report) {
    return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  }

  const format = (request.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
  const rows = await report.getRows();
  const filenameBase = `${report.key}-report-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    const csv = toCsv(rows, report.columns);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const buffer = await toXlsxBuffer(rows, report.columns, report.label);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await toPdfBuffer(report.label, rows, report.columns);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
      },
    });
  }

  return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
}
