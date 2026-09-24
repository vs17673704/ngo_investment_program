import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { buildDonationReceiptPdf } from "@/lib/receipts";

// BRD "Donation Processing": a downloadable receipt for an approved donation
// request, generated on-demand (no file storage infra). Accessible by the
// owning user or an Admin.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const request = await prisma.redemptionRequest.findUnique({
    where: { id },
    include: { user: true, donationRecipient: true },
  });
  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (request.userId !== session.sub && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (request.category !== "DONATION" || request.status !== "APPROVED") {
    return NextResponse.json({ error: "No receipt available for this request" }, { status: 400 });
  }

  const buffer = await buildDonationReceiptPdf({
    id: request.id,
    requestedAmount: Number(request.requestedAmount),
    donationReference: request.donationReference,
    createdAt: request.createdAt,
    user: { email: request.user.email },
    donationRecipient: request.donationRecipient ? { name: request.donationRecipient.name } : null,
  });

  if (!request.receiptGeneratedAt) {
    await prisma.redemptionRequest.update({
      where: { id: request.id },
      data: { receiptGeneratedAt: new Date() },
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="donation-receipt-${request.id}.pdf"`,
    },
  });
}
