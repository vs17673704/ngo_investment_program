import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export type ReportColumn = { key: string; label: string };

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    // Prisma Decimal or other objects with a toString()
    return String(value);
  }
  return String(value);
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: Record<string, unknown>[], columns: ReportColumn[]): string {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(formatCell(row[c.key]))).join(","),
  );
  return [header, ...lines].join("\r\n");
}

export async function toXlsxBuffer(
  rows: Record<string, unknown>[],
  columns: ReportColumn[],
  sheetTitle: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetTitle.slice(0, 31) || "Report");

  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: 22 }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const record: Record<string, unknown> = {};
    for (const c of columns) {
      record[c.key] = formatCell(row[c.key]);
    }
    sheet.addRow(record);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

const PAGE_MARGIN = 40;
const ROW_HEIGHT = 18;

export async function toPdfBuffer(
  title: string,
  rows: Record<string, unknown>[],
  columns: ReportColumn[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    const colWidth = pageWidth / Math.max(columns.length, 1);

    doc.fontSize(16).text(title, { align: "left" });
    doc.moveDown(0.5);

    let y = doc.y;

    function drawHeader() {
      doc.fontSize(9).font("Helvetica-Bold");
      columns.forEach((c, i) => {
        doc.text(c.label, PAGE_MARGIN + i * colWidth, y, {
          width: colWidth,
          ellipsis: true,
        });
      });
      y += ROW_HEIGHT;
      doc
        .moveTo(PAGE_MARGIN, y - 4)
        .lineTo(PAGE_MARGIN + pageWidth, y - 4)
        .strokeColor("#cccccc")
        .stroke();
      doc.font("Helvetica").fontSize(8);
    }

    drawHeader();

    for (const row of rows) {
      if (y > doc.page.height - PAGE_MARGIN - ROW_HEIGHT) {
        doc.addPage();
        y = PAGE_MARGIN;
        drawHeader();
      }
      columns.forEach((c, i) => {
        doc.text(formatCell(row[c.key]), PAGE_MARGIN + i * colWidth, y, {
          width: colWidth,
          ellipsis: true,
        });
      });
      y += ROW_HEIGHT;
    }

    if (rows.length === 0) {
      doc.text("No data available.", PAGE_MARGIN, y);
    }

    doc.end();
  });
}
