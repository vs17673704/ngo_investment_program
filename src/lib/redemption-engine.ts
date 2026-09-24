import { addDays, addMonths } from "date-fns";
import { Prisma, RedemptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/config";
import { ceilToWholeNumber, roundHalfUp } from "@/lib/money";

// Accepts either the top-level Prisma client or an active $transaction
// client, so the margin/balance reads below can be re-run inside the same
// row-locked transaction as the write that depends on them (BRD Rule XXXV
// concurrency safety) while remaining usable standalone for read-only pages.
type Db = typeof prisma | Prisma.TransactionClient;

// BRD Rule III: the user cannot redeem money back before the maturity of the
// selected plan tenure. Principal paid into a plan that has not yet matured
// (status ACTIVE or DISCONTINUED) is locked out of the redeemable balance;
// once a plan transitions to MATURED (see interest-engine.ts), its principal
// — plus the one-time interest ledger entry posted at that moment — becomes
// part of the unified, redeemable ledger balance (Rule XXXI).
export async function getLockedPrincipal(userId: string, db: Db = prisma): Promise<number> {
  const unmaturedPlans = await db.userPlan.findMany({
    where: { userId, status: { in: ["ACTIVE", "DISCONTINUED"] } },
    select: { principalPaid: true },
  });
  return unmaturedPlans.reduce((sum, up) => sum + Number(up.principalPaid), 0);
}

// BRD Rule XXV/XXIX: Available Margin = Actual Redeemable Balance − Total
// Active Reserved Redemption Amount (reservations from every active request
// across every category, for this user). Actual Redeemable Balance excludes
// principal still locked in unmatured plans (Rule III).
export async function getRedeemableBalance(userId: string, db: Db = prisma): Promise<number> {
  const [latest, lockedPrincipal] = await Promise.all([
    db.ledgerEntry.findFirst({
      where: { userId },
      orderBy: { transactionTimestamp: "desc" },
    }),
    getLockedPrincipal(userId, db),
  ]);
  const totalLedgerBalance = latest ? Number(latest.balanceAfter) : 0;
  return Math.max(0, roundHalfUp(totalLedgerBalance - lockedPrincipal));
}

const ACTIVE_REDEMPTION_STATUSES = ["PENDING", "AWAITING_SHORTFALL_RESOLUTION"] as const;

// By explicit product decision, a pending COURSE request is excluded from
// this sum: unlike every other category, the course amount must not affect
// Available Margin until an Admin has reviewed/approved the request (the
// actual ledger debit already only ever happens at approval — see
// approveRedemptionRequest — this additionally keeps the pre-approval margin
// display itself untouched). Accepted trade-off: this removes Rule XXXV's
// concurrent-double-spend protection for COURSE specifically — two pending
// course requests can no longer be caught against each other by this check.
export async function getTotalActiveReservations(userId: string, db: Db = prisma): Promise<number> {
  const [requests, enquiries] = await Promise.all([
    db.redemptionRequest.findMany({
      where: { userId, status: { in: [...ACTIVE_REDEMPTION_STATUSES] }, category: { not: "COURSE" } },
    }),
    db.franchiseeRedemptionEnquiry.findMany({
      where: { userId, status: { in: [...ACTIVE_REDEMPTION_STATUSES] } },
    }),
  ]);
  const requestTotal = requests.reduce((sum, r) => sum + Number(r.reservedAmount), 0);
  const enquiryTotal = enquiries.reduce((sum, e) => sum + Number(e.requestedAmount), 0);
  return roundHalfUp(requestTotal + enquiryTotal);
}

// BRD Rule XIII (spending half): Reward Points reserved (not yet spent) by
// this user's active redemption requests — mirrors getTotalActiveReservations
// for money, so a Reward Point cannot be double-applied across two concurrent
// COURSE requests any more than the same rupee of margin can.
export async function getReservedRewardPoints(userId: string, db: Db = prisma): Promise<number> {
  const requests = await db.redemptionRequest.findMany({
    where: { userId, status: { in: [...ACTIVE_REDEMPTION_STATUSES] } },
    select: { rewardPointsApplied: true },
  });
  return requests.reduce((sum, r) => sum + r.rewardPointsApplied, 0);
}

// Per-user inputs needed to preview a COURSE redemption, fetched once. Kept
// separate from the per-course calculation so a page listing many courses
// (src/app/dashboard/redeem/course/page.tsx) fetches these a single time
// instead of once per course (N+1 queries against the remote DB).
export async function getCourseRedemptionPreviewInputs(userId: string, db: Db = prisma) {
  const [user, reservedRewardPoints, latestUserPlan, { commonRewardPercent }] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { rewardPointsBalance: true } }),
    getReservedRewardPoints(userId, db),
    db.userPlan.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    getSettings(),
  ]);
  const rewardPercent =
    latestUserPlan?.rewardPercentSnapshot != null ? Number(latestUserPlan.rewardPercentSnapshot) : commonRewardPercent;
  const rewardPointsAvailable = Math.max(0, user.rewardPointsBalance - reservedRewardPoints);

  return { rewardPointsAvailable, rewardPercent };
}

// Pure calculation for BRD Rule XIII's "spending" half, given the per-user
// inputs above and one course's fee. Reward Points are applied automatically
// (not user-selectable): min(available Reward Points, course fee), at a
// fixed 1 point = ₹1. Used both by the course redeem page (Design.md 3.8
// calculation summary) and by createRedemptionRequest (at actual
// submission), so the preview shown to the user can never drift from what
// actually happens.
export function computeCourseRedemptionPreview(
  inputs: { rewardPointsAvailable: number; rewardPercent: number },
  courseFee: number,
) {
  const { rewardPointsAvailable, rewardPercent } = inputs;
  const rewardPointsApplied = Math.min(rewardPointsAvailable, Math.floor(courseFee));
  const redeemableBalancePortion = roundHalfUp(courseFee - rewardPointsApplied);
  const resultingRewardPointsBalance = rewardPointsAvailable - rewardPointsApplied;
  const newlyEarnedRewardPoints = ceilToWholeNumber(courseFee * (rewardPercent / 100));

  return {
    rewardPointsAvailable,
    rewardPointsApplied,
    redeemableBalancePortion,
    resultingRewardPointsBalance,
    rewardPercent,
    newlyEarnedRewardPoints,
  };
}

// Convenience wrapper for the single-course case (createRedemptionRequest).
export async function getCourseRedemptionPreview(userId: string, courseFee: number, db: Db = prisma) {
  const inputs = await getCourseRedemptionPreviewInputs(userId, db);
  return computeCourseRedemptionPreview(inputs, courseFee);
}

export async function getAvailableMargin(userId: string, db: Db = prisma): Promise<number> {
  const [balance, reserved] = await Promise.all([
    getRedeemableBalance(userId, db),
    getTotalActiveReservations(userId, db),
  ]);
  // Rounded per BRD Rule XXXIII/XXXIV: without this, IEEE-754 noise from the
  // Decimal -> Number conversions above (e.g. 188.79999999999995 instead of
  // 188.8) can make a request for the user's exact full margin compare as
  // "greater than" available margin and be wrongly parked in
  // AWAITING_SHORTFALL_RESOLUTION instead of PENDING.
  return roundHalfUp(balance - reserved);
}

// Design.md 3.7: append-only status timeline for a redemption request. Also
// carries the optional admin-authored "concern/message" for a transition
// (e.g. a reject reason) so the user's expanded request detail can show
// both requirements from a single source of truth.
async function recordRedemptionStatusEvent(
  db: Db,
  redemptionRequestId: string,
  status: RedemptionStatus,
  opts: { note?: string; actorUserId?: string } = {},
) {
  await db.redemptionStatusEvent.create({
    data: {
      redemptionRequestId,
      status,
      note: opts.note,
      actorUserId: opts.actorUserId,
    },
  });
}

const LEDGER_TYPE_BY_CATEGORY = {
  COURSE: "REDEMPTION_COURSE",
  REFUND: "REDEMPTION_REFUND",
  REINVESTMENT: "REDEMPTION_REINVESTMENT",
  DONATION: "REDEMPTION_DONATION",
  FRANCHISEE: "REDEMPTION_FRANCHISEE",
  GADGETS: "REDEMPTION_GADGETS",
} as const;

// BRD Rule XXII/XXV: a request may be submitted even when it exceeds
// Available Margin; it is simply parked in AWAITING_SHORTFALL_RESOLUTION
// until the shortfall is resolved offline and verified by an Admin.
export async function createRedemptionRequest(input: {
  userId: string;
  category: keyof typeof LEDGER_TYPE_BY_CATEGORY;
  requestedAmount: number;
  relatedCourseId?: string;
  // Design.md 3.11 [BRD-required]: Reinvestment must let the user select a
  // target plan for the amount being reinvested — a new UserPlan is created
  // for this plan on approval (see approveRedemptionRequest).
  targetPlanId?: string;
  // BRD "Donation Processing": user-selected recipient (from the
  // Admin-curated DonationRecipient list) and their consent, captured at
  // request time — required before the (offline) donation can be processed
  // on approval.
  donationRecipientId?: string;
  consentGiven?: boolean;
  comments?: string;
}) {
  const { redemptionExpiryDays } = await getSettings();

  if (input.category === "REINVESTMENT" && input.targetPlanId) {
    const targetPlan = await prisma.plan.findUnique({ where: { id: input.targetPlanId } });
    if (!targetPlan || targetPlan.status !== "ACTIVE") {
      throw new Error("Selected reinvestment target plan is not available");
    }
  }

  return prisma.$transaction(async (tx) => {
    // BRD Rule XXXV concurrency safety: two concurrent redemption requests
    // from the same user must not both read the same Available Margin and
    // both be admitted as PENDING against it (over-reservation). Locking the
    // User row for the duration of this transaction serializes concurrent
    // submissions from the same user so the margin read below is always
    // against reservations already committed by any prior request.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;

    const availableMargin = await getAvailableMargin(input.userId, tx);

    // BRD Rule XIII (spending half): for COURSE, previously earned Reward
    // Points automatically pay part of the fee first — only the remainder
    // needs to come from Available Margin, so shortfall is computed on that
    // net amount rather than the full fee.
    let rewardPointsApplied = 0;
    let amountNeedingMargin = input.requestedAmount;
    if (input.category === "COURSE") {
      const preview = await getCourseRedemptionPreview(input.userId, input.requestedAmount, tx);
      rewardPointsApplied = preview.rewardPointsApplied;
      amountNeedingMargin = preview.redeemableBalancePortion;
    }

    const shortfallAmount = Math.max(0, roundHalfUp(amountNeedingMargin - availableMargin));
    const status = shortfallAmount > 0 ? "AWAITING_SHORTFALL_RESOLUTION" : "PENDING";

    const created = await tx.redemptionRequest.create({
      data: {
        userId: input.userId,
        category: input.category,
        status,
        requestedAmount: input.requestedAmount,
        availableMarginAtRequest: availableMargin,
        shortfallAmount,
        reservedAmount: amountNeedingMargin,
        rewardPointsApplied,
        relatedCourseId: input.relatedCourseId,
        targetPlanId: input.targetPlanId,
        donationRecipientId: input.donationRecipientId,
        consentGiven: input.consentGiven ?? false,
        consentGivenAt: input.consentGiven ? new Date() : null,
        comments: input.comments,
        expiresAt: addDays(new Date(), redemptionExpiryDays),
      },
    });
    await recordRedemptionStatusEvent(tx, created.id, status, { actorUserId: input.userId });
    return created;
  });
}

// Design.md 3.13 [BRD-required]: Gadgets & Accessories is a multi-select
// cart, not a single item. Each cart line's stock is reserved atomically
// (the same "UPDATE ... WHERE stockQuantity - reservedQuantity >= N" pattern
// used previously for a single unit, generalized to arbitrary quantities) so
// concurrent requests against the same gadget can never over-reserve it.
export async function createGadgetCartRedemptionRequest(input: {
  userId: string;
  items: { gadgetItemId: string; quantity: number }[];
  comments?: string;
}) {
  if (input.items.length === 0) throw new Error("Cart is empty");
  const { redemptionExpiryDays } = await getSettings();

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;

    const lines: { gadgetItemId: string; quantity: number; priceAtRequest: number }[] = [];
    let requestedAmount = 0;
    for (const item of input.items) {
      if (item.quantity <= 0) continue;
      const reserved = await tx.$queryRaw<{ id: string; price: Prisma.Decimal }[]>`
        UPDATE "GadgetItem"
        SET "reservedQuantity" = "reservedQuantity" + ${item.quantity}
        WHERE "id" = ${item.gadgetItemId} AND "stockQuantity" - "reservedQuantity" >= ${item.quantity}
        RETURNING "id", "price"
      `;
      if (reserved.length === 0) {
        throw new Error("This item is out of stock.");
      }
      const price = Number(reserved[0].price);
      lines.push({ gadgetItemId: item.gadgetItemId, quantity: item.quantity, priceAtRequest: price });
      requestedAmount = roundHalfUp(requestedAmount + price * item.quantity);
    }
    if (lines.length === 0) throw new Error("Cart is empty");

    const availableMargin = await getAvailableMargin(input.userId, tx);
    const shortfallAmount = Math.max(0, roundHalfUp(requestedAmount - availableMargin));
    const status = shortfallAmount > 0 ? "AWAITING_SHORTFALL_RESOLUTION" : "PENDING";

    const created = await tx.redemptionRequest.create({
      data: {
        userId: input.userId,
        category: "GADGETS",
        status,
        requestedAmount,
        availableMarginAtRequest: availableMargin,
        shortfallAmount,
        reservedAmount: requestedAmount,
        comments: input.comments,
        expiresAt: addDays(new Date(), redemptionExpiryDays),
        gadgetItems: { create: lines },
      },
    });
    await recordRedemptionStatusEvent(tx, created.id, status, { actorUserId: input.userId });
    return created;
  });
}

// Design.md 3.13 [BRD-required]: "Pending gadget request modification: edited
// cart replaces the previous requested amount/reservation; Available Margin
// and Shortfall are recalculated from the revised amount; previous pending
// reservation must not be double-counted." The old cart's stock reservation
// is released first, inside the same transaction, before the new cart's
// stock is reserved and the margin/shortfall recomputed — so the old
// reservation is never counted alongside the new one.
export async function updateGadgetCartRedemptionRequest(input: {
  redemptionId: string;
  userId: string;
  items: { gadgetItemId: string; quantity: number }[];
  comments?: string;
}) {
  if (input.items.length === 0) throw new Error("Cart is empty");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;

    const existing = await tx.redemptionRequest.findUniqueOrThrow({
      where: { id: input.redemptionId },
      include: { gadgetItems: true },
    });
    if (existing.userId !== input.userId) throw new Error("Forbidden");
    if (existing.category !== "GADGETS") throw new Error("Not a gadgets redemption request");
    if (!["PENDING", "AWAITING_SHORTFALL_RESOLUTION"].includes(existing.status)) {
      throw new Error("Redemption request cannot be modified in its current state");
    }

    for (const line of existing.gadgetItems) {
      await tx.gadgetItem.update({
        where: { id: line.gadgetItemId },
        data: { reservedQuantity: { decrement: line.quantity } },
      });
    }
    await tx.redemptionGadgetItem.deleteMany({ where: { redemptionRequestId: existing.id } });

    // The revised cart must be re-evaluated fresh against the balance
    // (Design.md 3.13 / E2E-012 step 3): this request's own prior
    // reservedAmount is being replaced, not stacked, so it must not still
    // count against Available Margin while the new total is computed below.
    await tx.redemptionRequest.update({
      where: { id: existing.id },
      data: { reservedAmount: 0 },
    });

    const lines: { gadgetItemId: string; quantity: number; priceAtRequest: number }[] = [];
    let requestedAmount = 0;
    for (const item of input.items) {
      if (item.quantity <= 0) continue;
      const reserved = await tx.$queryRaw<{ id: string; price: Prisma.Decimal }[]>`
        UPDATE "GadgetItem"
        SET "reservedQuantity" = "reservedQuantity" + ${item.quantity}
        WHERE "id" = ${item.gadgetItemId} AND "stockQuantity" - "reservedQuantity" >= ${item.quantity}
        RETURNING "id", "price"
      `;
      if (reserved.length === 0) {
        throw new Error("This item is out of stock.");
      }
      const price = Number(reserved[0].price);
      lines.push({ gadgetItemId: item.gadgetItemId, quantity: item.quantity, priceAtRequest: price });
      requestedAmount = roundHalfUp(requestedAmount + price * item.quantity);
    }
    if (lines.length === 0) throw new Error("Cart is empty");

    const availableMargin = await getAvailableMargin(input.userId, tx);
    const shortfallAmount = Math.max(0, roundHalfUp(requestedAmount - availableMargin));
    const status = shortfallAmount > 0 ? "AWAITING_SHORTFALL_RESOLUTION" : "PENDING";

    const updated = await tx.redemptionRequest.update({
      where: { id: existing.id },
      data: {
        status,
        requestedAmount,
        availableMarginAtRequest: availableMargin,
        shortfallAmount,
        reservedAmount: requestedAmount,
        comments: input.comments,
        // A modified cart must be re-verified if it still (or newly) has a
        // shortfall — the prior verification was against the old amount.
        shortfallReference: null,
        shortfallVerifiedBy: null,
        shortfallVerifiedAt: null,
        gadgetItems: { create: lines },
      },
    });
    await recordRedemptionStatusEvent(tx, updated.id, status, {
      actorUserId: input.userId,
      note: "Cart modified",
    });
    return updated;
  });
}

// BRD Rule XXIV: only after Admin verifies the shortfall (if any) is
// resolved may the request move to APPROVED and be financially processed —
// a single ledger debit for the full requested amount, never split.
export async function approveRedemptionRequest(redemptionId: string, approverUserId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.redemptionRequest.findUniqueOrThrow({
      where: { id: redemptionId },
      include: { gadgetItems: true },
    });

    if (request.status === "AWAITING_SHORTFALL_RESOLUTION" && !request.shortfallVerifiedAt) {
      throw new Error("Shortfall must be verified before approval");
    }
    if (!["PENDING", "AWAITING_SHORTFALL_RESOLUTION"].includes(request.status)) {
      throw new Error("Redemption request is not in an approvable state");
    }

    // BRD Rule XXIV/Money Mechanics: the shortfall portion is resolved
    // offline and never touches the ledger. Only the amount actually drawn
    // from the internal Redeemable Balance is debited here. Based on
    // reservedAmount (not requestedAmount) so a COURSE request's Reward
    // Points portion — never itself drawn from the ledger — is correctly
    // excluded; this is a no-op for every other category, where
    // reservedAmount always equals requestedAmount.
    const internalPortion = roundHalfUp(Number(request.reservedAmount) - Number(request.shortfallAmount));

    if (internalPortion > 0) {
      const lastEntry = await tx.ledgerEntry.findFirst({
        where: { userId: request.userId },
        orderBy: { transactionTimestamp: "desc" },
      });
      const balanceBefore = lastEntry ? Number(lastEntry.balanceAfter) : 0;

      // BRD Rule III: re-verify at approval time (not just at request-submission
      // time) that this debit does not dip into principal still locked in an
      // unmatured plan — margin/shortfall can shift between submission and
      // approval (e.g. a plan matures or a new payment lands), and this is the
      // last, financially-binding checkpoint before the ledger is touched.
      const unmaturedPlans = await tx.userPlan.findMany({
        where: { userId: request.userId, status: { in: ["ACTIVE", "DISCONTINUED"] } },
        select: { principalPaid: true },
      });
      const lockedPrincipal = unmaturedPlans.reduce((sum, up) => sum + Number(up.principalPaid), 0);
      const maxRedeemable = Math.max(0, roundHalfUp(balanceBefore - lockedPrincipal));
      if (internalPortion > maxRedeemable) {
        throw new Error(
          "Cannot approve: requested amount exceeds redeemable balance because part of the user's principal is still locked in an unmatured plan (BRD Rule III).",
        );
      }

      const balanceAfter = roundHalfUp(balanceBefore - internalPortion);

      await tx.ledgerEntry.create({
        data: {
          userId: request.userId,
          transactionType: LEDGER_TYPE_BY_CATEGORY[request.category],
          amount: -internalPortion,
          balanceBefore,
          balanceAfter,
          approverUserId,
          approvalTimestamp: new Date(),
          description: `Redemption approved: ${request.category} (${request.id})`,
        },
      });

      // BRD "Full vs Partial Redemption" (Section 5): once a redemption
      // draws down a MATURED plan's redeemable balance, its status must
      // reflect that unambiguously — REDEEMED once the balance reaches
      // exactly 0, otherwise PARTIALLY_REDEEMED. The ledger balance is
      // pooled across every matured plan for this user, so this applies to
      // all of the user's currently MATURED/PARTIALLY_REDEEMED plans.
      // Round before comparing to zero: raw IEEE-754 subtraction on Decimal
      // -> Number conversions can leave noise like 388.79999999999995
      // instead of exactly 0, which would otherwise wrongly keep a fully
      // redeemed plan stuck at PARTIALLY_REDEEMED (BRD Rule XXXIII/XXXIV
      // Round Half Up applies to all monetary calculations, this included).
      const redeemableAfter = Math.max(0, roundHalfUp(maxRedeemable - internalPortion));
      await tx.userPlan.updateMany({
        where: { userId: request.userId, status: { in: ["MATURED", "PARTIALLY_REDEEMED"] } },
        data: { status: redeemableAfter <= 0 ? "REDEEMED" : "PARTIALLY_REDEEMED" },
      });
    }

    if (request.category === "GADGETS") {
      for (const line of request.gadgetItems) {
        await tx.gadgetItem.update({
          where: { id: line.gadgetItemId },
          data: { stockQuantity: { decrement: line.quantity }, reservedQuantity: { decrement: line.quantity } },
        });
      }
    }

    // Design.md 3.11 [BRD-required]: on approval, enrol the user into the
    // selected target plan using the actually-debited (internal) reinvestment
    // amount — mirrors subscribeToPlanAction's UserPlan creation, but with no
    // PaymentMandate since this isn't an AutoPay-funded subscription: the
    // plan is funded immediately and fully by the reinvested amount.
    if (request.category === "REINVESTMENT" && request.targetPlanId && internalPortion > 0) {
      const targetPlan = await tx.plan.findUniqueOrThrow({
        where: { id: request.targetPlanId },
        include: { interestMethod: true },
      });
      await tx.userPlan.create({
        data: {
          userId: request.userId,
          planId: targetPlan.id,
          interestMethodId: targetPlan.interestMethodId,
          interestMethodVersion: targetPlan.interestMethod.version,
          rewardPercentSnapshot: targetPlan.rewardPercent,
          commissionPercentSnapshot: targetPlan.commissionPercent,
          paymentAmount: internalPortion,
          paymentFrequency: targetPlan.paymentFrequency,
          principalPaid: internalPortion,
          remainingUnpaidPrincipal: 0,
          maturityDate: addMonths(new Date(), targetPlan.tenureMonths),
        },
      });
    }

    // BRD Rule XIII / Rule XXXIII Reward Points Rounding Exception: on an
    // approved COURSE redemption, Reward Points = Applicable Course Fee x
    // Configured Reward Percentage (the full course fee, even if partly paid
    // with previously earned Reward Points), rounded UP to the nearest whole
    // point. The Reward Percentage used is the one configured for the user's
    // plan (snapshotted on their most recent UserPlan), falling back to the
    // Admin's common Reward Percentage when no plan-specific value applies.
    if (request.category === "COURSE" && request.relatedCourseId) {
      const course = await tx.course.findUniqueOrThrow({ where: { id: request.relatedCourseId } });
      const latestUserPlan = await tx.userPlan.findFirst({
        where: { userId: request.userId },
        orderBy: { createdAt: "desc" },
      });
      const { commonRewardPercent } = await getSettings();
      const rewardPercent =
        latestUserPlan?.rewardPercentSnapshot != null
          ? Number(latestUserPlan.rewardPercentSnapshot)
          : commonRewardPercent;
      const courseFee = Number(course.fee);
      const rewardPoints = ceilToWholeNumber(courseFee * (rewardPercent / 100));

      // BRD Rule XIII (spending half): the Reward Points reserved at request
      // time for this redemption are spent now, netted against the points
      // newly earned from this same approval, in one atomic update.
      const netRewardPoints = rewardPoints - request.rewardPointsApplied;
      if (netRewardPoints !== 0) {
        await tx.user.update({
          where: { id: request.userId },
          data: { rewardPointsBalance: { increment: netRewardPoints } },
        });
      }
    }

    // BRD "Donation Processing": Admin approval triggers the applicable
    // financial processing and the system must record a transaction
    // reference — generated here, at the moment of approval, mirroring how
    // the ledger entry above is also only ever created at approval time.
    if (request.category === "DONATION") {
      const donationReference = `DON-${request.id.slice(-8).toUpperCase()}`;
      await tx.redemptionRequest.update({ where: { id: request.id }, data: { donationReference } });
    }

    const updated = await tx.redemptionRequest.update({
      where: { id: redemptionId },
      data: { status: "APPROVED", reservedAmount: 0 },
    });
    await recordRedemptionStatusEvent(tx, redemptionId, "APPROVED", { actorUserId: approverUserId });

    await tx.notification.create({
      data: {
        userId: request.userId,
        type: "REFUND_PROCESSED",
        title: "Redemption approved",
        message: `Your ${request.category.toLowerCase()} redemption of ₹${Number(request.requestedAmount).toFixed(2)} has been approved and processed.`,
      },
    });

    return updated;
  });
}

// Mirrors createRedemptionRequest's margin-read + row-lock pattern (BRD Rule
// XXXV) for the separate Franchisee Redemption Enquiry model (Rule XXXVII).
export async function createFranchiseeRedemptionEnquiry(input: {
  userId: string;
  franchiseePlanId: string;
  collegeId: string;
  price: number;
}) {
  const { redemptionExpiryDays } = await getSettings();

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;

    const availableMargin = await getAvailableMargin(input.userId, tx);
    const shortfallAmount = Math.max(0, roundHalfUp(input.price - availableMargin));
    const status = shortfallAmount > 0 ? "AWAITING_SHORTFALL_RESOLUTION" : "PENDING";

    return tx.franchiseeRedemptionEnquiry.create({
      data: {
        userId: input.userId,
        franchiseePlanId: input.franchiseePlanId,
        collegeId: input.collegeId,
        status,
        requestedAmount: input.price,
        availableMarginAtRequest: availableMargin,
        shortfallAmount,
        expiresAt: addDays(new Date(), redemptionExpiryDays),
      },
    });
  });
}

// Design.md 3.7 [BRD-required]: an Admin may optionally leave a free-text
// concern/message with a rejection; it is persisted onto the status
// timeline (not just fired as an ephemeral Notification) so the user can
// still see it later from their own request's expanded detail view.
export async function rejectRedemptionRequest(redemptionId: string, adminUserId?: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.redemptionRequest.findUniqueOrThrow({
      where: { id: redemptionId },
      include: { gadgetItems: true },
    });
    const request = await tx.redemptionRequest.update({
      where: { id: redemptionId },
      data: { status: "REJECTED", reservedAmount: 0 },
    });
    await recordRedemptionStatusEvent(tx, redemptionId, "REJECTED", { actorUserId: adminUserId, note: reason });

    if (request.category === "GADGETS") {
      for (const line of before.gadgetItems) {
        await tx.gadgetItem.update({
          where: { id: line.gadgetItemId },
          data: { reservedQuantity: { decrement: line.quantity } },
        });
      }
    }

    await tx.notification.create({
      data: {
        userId: request.userId,
        type: "ADMIN_MESSAGE",
        title: "Redemption rejected",
        message: reason
          ? `Your ${request.category.toLowerCase()} redemption request of ₹${Number(request.requestedAmount).toFixed(2)} was rejected by the Admin: ${reason}`
          : `Your ${request.category.toLowerCase()} redemption request of ₹${Number(request.requestedAmount).toFixed(2)} was rejected by the Admin.`,
      },
    });

    return request;
  });
}

export async function cancelRedemptionRequest(redemptionId: string, userId: string) {
  const request = await prisma.redemptionRequest.findUniqueOrThrow({ where: { id: redemptionId } });
  if (request.userId !== userId) throw new Error("Forbidden");
  if (!["PENDING", "AWAITING_SHORTFALL_RESOLUTION"].includes(request.status)) {
    throw new Error("Redemption request cannot be cancelled in its current state");
  }
  const cancelled = await prisma.redemptionRequest.update({
    where: { id: redemptionId },
    data: { status: "CANCELLED", reservedAmount: 0 },
  });
  await recordRedemptionStatusEvent(prisma, redemptionId, "CANCELLED", { actorUserId: userId });
  return cancelled;
}

export async function verifyRedemptionShortfall(input: {
  redemptionId: string;
  adminUserId: string;
  reference: string;
}) {
  const updated = await prisma.redemptionRequest.update({
    where: { id: input.redemptionId },
    data: {
      shortfallReference: input.reference,
      shortfallVerifiedBy: input.adminUserId,
      shortfallVerifiedAt: new Date(),
    },
  });
  // Same status (AWAITING_SHORTFALL_RESOLUTION) but a distinct timeline
  // entry — Design.md 3.7's "offline shortfall-resolution evidence" needs
  // its own dated entry, not just a mutation of the request row.
  await recordRedemptionStatusEvent(prisma, input.redemptionId, updated.status, {
    actorUserId: input.adminUserId,
    note: `Shortfall verified — reference ${input.reference}`,
  });
  return updated;
}

// Expires stale PENDING / AWAITING_SHORTFALL_RESOLUTION requests and
// releases their reservations (financial and, for GADGETS, inventory), per
// BRD Rule XXI (system-wide expiry) and the redemption inventory-release rule.
export async function expireStaleRedemptionRequests() {
  const now = new Date();
  const stale = await prisma.redemptionRequest.findMany({
    where: { status: { in: [...ACTIVE_REDEMPTION_STATUSES] }, expiresAt: { lte: now } },
    include: { gadgetItems: true },
  });

  for (const request of stale) {
    await prisma.$transaction(async (tx) => {
      await tx.redemptionRequest.update({
        where: { id: request.id },
        data: { status: "EXPIRED", reservedAmount: 0 },
      });
      await recordRedemptionStatusEvent(tx, request.id, "EXPIRED");

      if (request.category === "GADGETS") {
        for (const line of request.gadgetItems) {
          await tx.gadgetItem.update({
            where: { id: line.gadgetItemId },
            data: { reservedQuantity: { decrement: line.quantity } },
          });
        }
      }

      await tx.notification.create({
        data: {
          userId: request.userId,
          type: "ADMIN_MESSAGE",
          title: "Redemption request expired",
          message: `Your ${request.category.toLowerCase()} redemption request of ₹${Number(request.requestedAmount).toFixed(2)} has expired and its reservation has been released.`,
        },
      });
    });
  }

  const staleEnquiries = await prisma.franchiseeRedemptionEnquiry.findMany({
    where: { status: { in: [...ACTIVE_REDEMPTION_STATUSES] }, expiresAt: { lte: now } },
  });

  for (const enquiry of staleEnquiries) {
    await prisma.$transaction(async (tx) => {
      await tx.franchiseeRedemptionEnquiry.update({
        where: { id: enquiry.id },
        data: { status: "EXPIRED" },
      });

      await tx.notification.create({
        data: {
          userId: enquiry.userId,
          type: "ADMIN_MESSAGE",
          title: "Franchisee enquiry expired",
          message: `Your franchisee redemption enquiry of ₹${Number(enquiry.requestedAmount).toFixed(2)} has expired and its reservation has been released.`,
        },
      });
    });
  }

  return stale.length + staleEnquiries.length;
}
