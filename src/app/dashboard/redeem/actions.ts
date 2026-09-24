"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  createRedemptionRequest,
  createFranchiseeRedemptionEnquiry,
  createGadgetCartRedemptionRequest,
  updateGadgetCartRedemptionRequest,
  cancelRedemptionRequest,
} from "@/lib/redemption-engine";
import { logAudit } from "@/lib/audit";
import { emitAdminEvent } from "@/lib/events/admin-events";

export type RedeemState = { error?: string } | undefined;

type CartLine = { gadgetItemId: string; quantity: number };

function parseCart(formData: FormData): CartLine[] {
  const raw = String(formData.get("cart") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((line): line is { gadgetItemId: unknown; quantity: unknown } => typeof line === "object" && line !== null)
    .map((line) => ({
      gadgetItemId: String((line as { gadgetItemId: unknown }).gadgetItemId ?? ""),
      quantity: Number((line as { quantity: unknown }).quantity ?? 0),
    }))
    .filter((line) => line.gadgetItemId && Number.isInteger(line.quantity) && line.quantity > 0);
}

// Design.md 3.13 [BRD-required]: Gadgets & Accessories multi-select cart.
export async function submitGadgetCartRedemptionAction(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const items = parseCart(formData);
  if (items.length === 0) {
    return { error: "Select at least one item and quantity." };
  }
  const comments = String(formData.get("comments") ?? "");

  let requestId: string;
  try {
    const request = await createGadgetCartRedemptionRequest({
      userId: session.sub,
      items,
      comments: comments || undefined,
    });
    requestId = request.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to submit request." };
  }

  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTION_REQUESTED",
    entityRef: requestId,
    details: { category: "GADGETS" },
  });
  emitAdminEvent({
    type: "redemption.requested",
    message: "New gadget cart redemption request submitted",
    details: { redemptionId: requestId, category: "GADGETS" },
  });

  redirect("/dashboard/redeem");
}

// Design.md 3.13 [BRD-required]: Pending gadget request modification.
export async function updateGadgetCartRedemptionAction(
  redemptionId: string,
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const items = parseCart(formData);
  if (items.length === 0) {
    return { error: "Select at least one item and quantity." };
  }
  const comments = String(formData.get("comments") ?? "");

  try {
    await updateGadgetCartRedemptionRequest({
      redemptionId,
      userId: session.sub,
      items,
      comments: comments || undefined,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to update request." };
  }

  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTION_MODIFIED",
    entityRef: redemptionId,
    details: { category: "GADGETS" },
  });
  emitAdminEvent({
    type: "redemption.modified",
    message: "A pending gadget redemption request was modified",
    details: { redemptionId, category: "GADGETS" },
  });

  redirect("/dashboard/redeem");
}

export async function submitCourseRedemptionAction(
  courseId: string,
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: "Course not found." };

  const request = await createRedemptionRequest({
    userId: session.sub,
    category: "COURSE",
    requestedAmount: Number(course.fee),
    relatedCourseId: courseId,
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTION_REQUESTED",
    entityRef: request.id,
    details: { category: "COURSE" },
  });
  emitAdminEvent({
    type: "redemption.requested",
    message: `New course redemption request (${course.name}) submitted`,
    details: { redemptionId: request.id, category: "COURSE" },
  });

  redirect("/dashboard/redeem");
}

export async function submitAmountRedemptionAction(
  category: "REFUND",
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const amount = Number(formData.get("amount"));
  const comments = String(formData.get("comments") ?? "");
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount greater than zero." };
  }

  const request = await createRedemptionRequest({
    userId: session.sub,
    category,
    requestedAmount: amount,
    comments: comments || undefined,
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTION_REQUESTED",
    entityRef: request.id,
    details: { category },
  });
  emitAdminEvent({
    type: "redemption.requested",
    message: `New ${category.toLowerCase()} redemption request (${amount}) submitted`,
    details: { redemptionId: request.id, category },
  });

  redirect("/dashboard/redeem");
}

// BRD "Donation Processing": user selects a recipient from the Admin-curated
// list and must give consent before the (offline, post-approval) donation
// processing can occur.
export async function submitDonationRedemptionAction(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const amount = Number(formData.get("amount"));
  const donationRecipientId = String(formData.get("donationRecipientId") ?? "");
  const consent = formData.get("consent");
  const comments = String(formData.get("comments") ?? "");
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount greater than zero." };
  }
  if (!donationRecipientId) {
    return { error: "Select a donation recipient." };
  }
  if (consent !== "on") {
    return { error: "You must consent to this donation being processed before submitting." };
  }
  const recipient = await prisma.donationRecipient.findUnique({ where: { id: donationRecipientId } });
  if (!recipient || !recipient.active) {
    return { error: "Selected recipient is not available." };
  }

  const request = await createRedemptionRequest({
    userId: session.sub,
    category: "DONATION",
    requestedAmount: amount,
    donationRecipientId,
    consentGiven: true,
    comments: comments || undefined,
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTION_REQUESTED",
    entityRef: request.id,
    details: { category: "DONATION", donationRecipientId },
  });
  emitAdminEvent({
    type: "redemption.requested",
    message: `New donation redemption request (${amount}) submitted for ${recipient.name}`,
    details: { redemptionId: request.id, category: "DONATION" },
  });

  redirect("/dashboard/redeem");
}

// Design.md 3.11 [BRD-required]: Reinvestment target-plan selection.
export async function submitReinvestmentRedemptionAction(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const amount = Number(formData.get("amount"));
  const targetPlanId = String(formData.get("targetPlanId") ?? "");
  const comments = String(formData.get("comments") ?? "");
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount greater than zero." };
  }
  if (!targetPlanId) {
    return { error: "Select a plan to reinvest into." };
  }
  const targetPlan = await prisma.plan.findUnique({ where: { id: targetPlanId } });
  if (!targetPlan || targetPlan.status !== "ACTIVE") {
    return { error: "Selected plan is not available." };
  }

  let requestId: string;
  try {
    const request = await createRedemptionRequest({
      userId: session.sub,
      category: "REINVESTMENT",
      requestedAmount: amount,
      targetPlanId,
      comments: comments || undefined,
    });
    requestId = request.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unable to submit request." };
  }

  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTION_REQUESTED",
    entityRef: requestId,
    details: { category: "REINVESTMENT", targetPlanId },
  });
  emitAdminEvent({
    type: "redemption.requested",
    message: `New reinvestment redemption request (${amount}) submitted, targeting ${targetPlan.name}`,
    details: { redemptionId: requestId, category: "REINVESTMENT" },
  });

  redirect("/dashboard/redeem");
}

export async function submitFranchiseeEnquiryAction(
  franchiseePlanId: string,
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const collegeId = String(formData.get("collegeId") ?? "");
  const plan = await prisma.franchiseePlan.findUnique({ where: { id: franchiseePlanId } });
  if (!plan || !collegeId) return { error: "Select a college to continue." };

  const price = Number(plan.oneTimeDeductiblePrice);
  const enquiry = await createFranchiseeRedemptionEnquiry({
    userId: session.sub,
    franchiseePlanId,
    collegeId,
    price,
  });
  const status = enquiry.status;

  await logAudit({
    actorUserId: session.sub,
    eventType: "FRANCHISEE_ENQUIRY_SUBMITTED",
    entityRef: enquiry.id,
  });
  emitAdminEvent({
    type: "franchisee.enquiry.submitted",
    message: `New franchisee enquiry submitted (${plan.name})`,
    details: { enquiryId: enquiry.id, status },
  });

  redirect("/dashboard/redeem");
}

export async function cancelRedemptionAction(redemptionId: string): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const request = await prisma.redemptionRequest.findUnique({
    where: { id: redemptionId },
    include: { gadgetItems: true },
  });
  if (request?.category === "GADGETS") {
    for (const line of request.gadgetItems) {
      await prisma.gadgetItem.update({
        where: { id: line.gadgetItemId },
        data: { reservedQuantity: { decrement: line.quantity } },
      });
    }
  }

  await cancelRedemptionRequest(redemptionId, session.sub);
  await logAudit({
    actorUserId: session.sub,
    eventType: "REDEMPTION_CANCELLED",
    entityRef: redemptionId,
  });
  emitAdminEvent({
    type: "redemption.cancelled",
    message: "A redemption request was cancelled by the user",
    details: { redemptionId },
  });
  revalidatePath("/dashboard/redeem");
}
