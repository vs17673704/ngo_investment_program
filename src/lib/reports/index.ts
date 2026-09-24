import { prisma } from "@/lib/prisma";
import type { ReportColumn } from "./export";

export type ReportDefinition = {
  key: string;
  label: string;
  columns: ReportColumn[];
  getRows(): Promise<Record<string, unknown>[]>;
};

const userReport: ReportDefinition = {
  key: "users",
  label: "User Report",
  columns: [
    { key: "email", label: "Email" },
    { key: "role", label: "Role" },
    { key: "referralCode", label: "Referral Code" },
    { key: "referralCodeActive", label: "Referral Code Active" },
    { key: "isEmailVerified", label: "Email Verified" },
    { key: "rewardPointsBalance", label: "Reward Points Balance" },
    { key: "locked", label: "Locked" },
    { key: "createdAt", label: "Created At" },
  ],
  async getRows() {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    const now = new Date();
    return users.map((u) => ({
      email: u.email,
      role: u.role,
      referralCode: u.referralCode,
      referralCodeActive: u.referralCodeActive,
      isEmailVerified: u.isEmailVerified,
      rewardPointsBalance: u.rewardPointsBalance,
      locked: Boolean(u.lockedUntil && u.lockedUntil > now),
      createdAt: u.createdAt,
    }));
  },
};

const paymentReport: ReportDefinition = {
  key: "payments",
  label: "Payment Report",
  columns: [
    { key: "id", label: "Payment ID" },
    { key: "userEmail", label: "User Email" },
    { key: "planName", label: "Plan" },
    { key: "amount", label: "Amount" },
    { key: "status", label: "Status" },
    { key: "method", label: "Method" },
    { key: "scheduledDate", label: "Scheduled Date" },
    { key: "actualDate", label: "Actual Date" },
    { key: "retryCount", label: "Retry Count" },
  ],
  async getRows() {
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      include: { userPlan: { include: { user: true, plan: true } } },
    });
    return payments.map((p) => ({
      id: p.id,
      userEmail: p.userPlan.user.email,
      planName: p.userPlan.plan.name,
      amount: p.amount,
      status: p.status,
      method: p.method,
      scheduledDate: p.scheduledDate,
      actualDate: p.actualDate,
      retryCount: p.retryCount,
    }));
  },
};

const interestReport: ReportDefinition = {
  key: "interest",
  label: "Interest Report",
  columns: [
    { key: "id", label: "Ledger Entry ID" },
    { key: "userEmail", label: "User Email" },
    { key: "amount", label: "Interest Amount" },
    { key: "balanceBefore", label: "Balance Before" },
    { key: "balanceAfter", label: "Balance After" },
    { key: "description", label: "Description" },
    { key: "transactionTimestamp", label: "Transaction Date" },
  ],
  async getRows() {
    const entries = await prisma.ledgerEntry.findMany({
      where: { transactionType: "INTEREST" },
      orderBy: { transactionTimestamp: "desc" },
      include: { user: true },
    });
    return entries.map((e) => ({
      id: e.id,
      userEmail: e.user.email,
      amount: e.amount,
      balanceBefore: e.balanceBefore,
      balanceAfter: e.balanceAfter,
      description: e.description,
      transactionTimestamp: e.transactionTimestamp,
    }));
  },
};

const referralReport: ReportDefinition = {
  key: "referrals",
  label: "Referral Report",
  columns: [
    { key: "id", label: "Referral ID" },
    { key: "referrerEmail", label: "Referrer Email" },
    { key: "referredEmail", label: "Referred Email" },
    { key: "referralCodeUsed", label: "Referral Code Used" },
    { key: "status", label: "Status" },
    { key: "expiryDate", label: "Expiry Date" },
    { key: "latestCommissionStatus", label: "Latest Commission Status" },
    { key: "createdAt", label: "Created At" },
  ],
  async getRows() {
    const referrals = await prisma.referral.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        referrer: true,
        referred: true,
        commissions: { orderBy: { accrualDate: "desc" }, take: 1 },
      },
    });
    return referrals.map((r) => ({
      id: r.id,
      referrerEmail: r.referrer.email,
      referredEmail: r.referred.email,
      referralCodeUsed: r.referralCodeUsed,
      status: r.status,
      expiryDate: r.expiryDate,
      latestCommissionStatus: r.commissions[0]?.status ?? "NONE",
      createdAt: r.createdAt,
    }));
  },
};

const planReport: ReportDefinition = {
  key: "plans",
  label: "Plan Report",
  columns: [
    { key: "id", label: "Plan ID" },
    { key: "name", label: "Plan Name" },
    { key: "tenureMonths", label: "Tenure (Months)" },
    { key: "paymentFrequency", label: "Payment Frequency" },
    { key: "commissionPercent", label: "Commission %" },
    { key: "rewardPercent", label: "Reward %" },
    { key: "status", label: "Status" },
    { key: "activeUserPlanCount", label: "Active Subscriptions" },
    { key: "totalUserPlanCount", label: "Total Subscriptions" },
  ],
  async getRows() {
    const plans = await prisma.plan.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { userPlans: true } } },
    });
    const activeCounts = await prisma.userPlan.groupBy({
      by: ["planId"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    });
    const activeByPlan = new Map(activeCounts.map((c) => [c.planId, c._count._all]));
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      tenureMonths: p.tenureMonths,
      paymentFrequency: p.paymentFrequency,
      commissionPercent: p.commissionPercent,
      rewardPercent: p.rewardPercent,
      status: p.status,
      activeUserPlanCount: activeByPlan.get(p.id) ?? 0,
      totalUserPlanCount: p._count.userPlans,
    }));
  },
};

const refundReport: ReportDefinition = {
  key: "refunds",
  label: "Refund Report",
  columns: [
    { key: "id", label: "Request ID" },
    { key: "userEmail", label: "User Email" },
    { key: "status", label: "Status" },
    { key: "requestedAmount", label: "Requested Amount" },
    { key: "shortfallAmount", label: "Shortfall Amount" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  async getRows() {
    const refunds = await prisma.redemptionRequest.findMany({
      where: { category: "REFUND" },
      orderBy: { createdAt: "desc" },
      include: { user: true },
    });
    return refunds.map((r) => ({
      id: r.id,
      userEmail: r.user.email,
      status: r.status,
      requestedAmount: r.requestedAmount,
      shortfallAmount: r.shortfallAmount,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  },
};

const rewardReport: ReportDefinition = {
  key: "rewards",
  label: "Reward Report",
  columns: [
    { key: "id", label: "Request ID" },
    { key: "userEmail", label: "User Email" },
    { key: "category", label: "Category" },
    { key: "status", label: "Status" },
    { key: "requestedAmount", label: "Requested Amount" },
    { key: "reservedAmount", label: "Reserved Amount" },
    { key: "createdAt", label: "Created At" },
    { key: "expiresAt", label: "Expires At" },
  ],
  async getRows() {
    const requests = await prisma.redemptionRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: true },
    });
    return requests.map((r) => ({
      id: r.id,
      userEmail: r.user.email,
      category: r.category,
      status: r.status,
      requestedAmount: r.requestedAmount,
      reservedAmount: r.reservedAmount,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    }));
  },
};

const enquiryReport: ReportDefinition = {
  key: "enquiries",
  label: "Enquiry Report",
  columns: [
    { key: "id", label: "Enquiry ID" },
    { key: "enquiryType", label: "Enquiry Type" },
    { key: "userEmail", label: "User Email" },
    { key: "franchiseePlanName", label: "Franchisee Plan" },
    { key: "collegeName", label: "College" },
    { key: "status", label: "Status" },
    { key: "requestedAmount", label: "Requested Amount" },
    { key: "shortfallAmount", label: "Shortfall Amount" },
    { key: "createdAt", label: "Created At" },
  ],
  async getRows() {
    const enquiries = await prisma.franchiseeRedemptionEnquiry.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: true, franchiseePlan: true, college: true },
    });
    return enquiries.map((e) => ({
      id: e.id,
      enquiryType: "FRANCHISEE_REDEMPTION",
      userEmail: e.user.email,
      franchiseePlanName: e.franchiseePlan.name,
      collegeName: e.college.name,
      status: e.status,
      requestedAmount: e.requestedAmount,
      shortfallAmount: e.shortfallAmount,
      createdAt: e.createdAt,
    }));
  },
};

const generalEnquiryReport: ReportDefinition = {
  key: "general-enquiries",
  label: "General Enquiry Report",
  columns: [
    { key: "id", label: "Enquiry ID" },
    { key: "enquiryType", label: "Enquiry Type" },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "message", label: "Message" },
    { key: "status", label: "Status" },
    { key: "source", label: "Source" },
    { key: "resolvedByEmail", label: "Resolved By" },
    { key: "createdAt", label: "Created At" },
    { key: "resolvedAt", label: "Resolved At" },
  ],
  async getRows() {
    const enquiries = await prisma.generalEnquiry.findMany({
      orderBy: { createdAt: "desc" },
      include: { resolvedBy: { select: { email: true } } },
    });
    return enquiries.map((e) => ({
      id: e.id,
      enquiryType: "GENERAL",
      name: e.name,
      email: e.email,
      phone: e.phone ?? "",
      message: e.message,
      status: e.status,
      source: e.source,
      resolvedByEmail: e.resolvedBy?.email ?? "",
      createdAt: e.createdAt,
      resolvedAt: e.resolvedAt,
    }));
  },
};

const revenueReport: ReportDefinition = {
  key: "revenue",
  label: "Revenue Report",
  columns: [
    { key: "period", label: "Month" },
    { key: "paymentCount", label: "Successful Payments" },
    { key: "totalAmount", label: "Total Revenue" },
  ],
  async getRows() {
    const payments = await prisma.payment.findMany({
      where: { status: "SUCCESS" },
      select: { amount: true, actualDate: true, scheduledDate: true },
    });
    const byPeriod = new Map<string, { count: number; total: number }>();
    for (const p of payments) {
      const date = p.actualDate ?? p.scheduledDate;
      const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const existing = byPeriod.get(period) ?? { count: 0, total: 0 };
      existing.count += 1;
      existing.total += Number(p.amount);
      byPeriod.set(period, existing);
    }
    return [...byPeriod.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([period, agg]) => ({
        period,
        paymentCount: agg.count,
        totalAmount: agg.total.toFixed(2),
      }));
  },
};

const auditReport: ReportDefinition = {
  key: "audit",
  label: "Audit Report",
  columns: [
    { key: "id", label: "Log ID" },
    { key: "actorEmail", label: "Actor Email" },
    { key: "eventType", label: "Event Type" },
    { key: "entityRef", label: "Entity Ref" },
    { key: "details", label: "Details" },
    { key: "timestamp", label: "Timestamp" },
  ],
  async getRows() {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      include: { actor: true },
      take: 5000,
    });
    return logs.map((l) => ({
      id: l.id,
      actorEmail: l.actor?.email ?? "SYSTEM",
      eventType: l.eventType,
      entityRef: l.entityRef ?? "",
      details: l.details ? JSON.stringify(l.details) : "",
      timestamp: l.timestamp,
    }));
  },
};

export const reportDefinitions: ReportDefinition[] = [
  paymentReport,
  interestReport,
  referralReport,
  planReport,
  refundReport,
  rewardReport,
  enquiryReport,
  generalEnquiryReport,
  revenueReport,
  auditReport,
  userReport,
];

export const reportsByKey: Record<string, ReportDefinition> = Object.fromEntries(
  reportDefinitions.map((r) => [r.key, r]),
);
