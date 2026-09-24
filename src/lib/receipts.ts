import PDFDocument from "pdfkit";

// BRD "Donation Processing": a receipt/document must be generated once a
// donation has been approved and processed. Reuses the same PDFDocument ->
// Buffer pattern as src/lib/reports/export.ts's toPdfBuffer, but as a single
// formatted document rather than a tabular report.
export async function buildDonationReceiptPdf(request: {
  id: string;
  requestedAmount: number | string;
  donationReference: string | null;
  createdAt: Date;
  user: { email: string };
  donationRecipient: { name: string } | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: Error) => reject(err));

    doc.fontSize(20).font("Helvetica-Bold").text("Donation Receipt", { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(11).font("Helvetica");
    const rows: [string, string][] = [
      ["Receipt reference", request.donationReference ?? "—"],
      ["Donor", request.user.email],
      ["Recipient", request.donationRecipient?.name ?? "—"],
      ["Amount", `Rs. ${Number(request.requestedAmount).toFixed(2)}`],
      ["Request date", request.createdAt.toDateString()],
      ["Issued on", new Date().toDateString()],
    ];
    for (const [label, value] of rows) {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }).font("Helvetica").text(value);
      doc.moveDown(0.5);
    }

    doc.moveDown(1);
    doc
      .fontSize(9)
      .fillColor("#666666")
      .text(
        "This receipt confirms that the above donation request was approved and processed on the donor's behalf, with consent, to the stated recipient.",
        { align: "left" },
      );

    doc.end();
  });
}
