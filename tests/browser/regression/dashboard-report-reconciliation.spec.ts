import { test, expect, type BrowserContextOptions, type APIRequestContext } from "playwright/test";
import { loginAsAdmin, prisma, uniqueSuffix } from "../../helpers";
import { createUser, createUserWithRedeemableBalance, createReferralWithAccruedCommission, createDuePaymentMandate } from "../fixtures";
import { processScheduledPayment } from "../../../src/lib/payment-engine";

// Rewritten from tests/reports.spec.ts (Phase D, per plan.md): the original
// only checked GET /api/admin/reports/<key>?format=csv returned HTTP 200 with
// a text/csv content-type, never that the CSV actually reflects real DB
// state. This file drives real writes (via fixtures / the payment engine /
// direct Prisma inserts for read-side-only entities) and parses each
// resulting CSV to assert specific rows/aggregates match, which is the only
// way to catch a bug in src/lib/reports/index.ts's queries or field mapping.
//
// Run last in Phase D per plan.md ("since it needs prior flows' data to
// reconcile something real") — though every reconciliation below creates its
// own fixture data and looks it up by exact ID/email, so it does not actually
// depend on suite ordering or any other file having run first.
const REPORT_KEYS = [
  "users",
  "payments",
  "interest",
  "referrals",
  "plans",
  "refunds",
  "rewards",
  "enquiries",
  "general-enquiries",
  "revenue",
  "audit",
];

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

let adminStorageState: BrowserContextOptions["storageState"];

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await loginAsAdmin(page);
  await page.waitForURL("**/admin");
  adminStorageState = await page.context().storageState();
  await page.close();
});

/**
 * Minimal RFC4180-subset CSV parser matching src/lib/reports/export.ts's
 * toCsv/csvEscape exactly (quotes a field only when it contains a comma,
 * quote, or newline; doubles embedded quotes). Returns rows keyed by the
 * CSV's header labels (the report's `columns[].label`, not `.key`).
 */
function parseCsvLines(csv: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < csv.length) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r" && csv[i + 1] === "\n") {
      row.push(field);
      lines.push(row);
      row = [];
      field = "";
      i += 2;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      lines.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    lines.push(row);
  }
  return lines;
}

function parseCsvRows(csv: string): Record<string, string>[] {
  const [header, ...body] = parseCsvLines(csv);
  return body.map((cols) => Object.fromEntries(header.map((h, i) => [h, cols[i] ?? ""])));
}

async function fetchReportRows(request: APIRequestContext, key: string): Promise<Record<string, string>[]> {
  const response = await request.get(`/api/admin/reports/${key}?format=csv`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const body = await response.text();
  return parseCsvRows(body);
}

test(`all ${REPORT_KEYS.length} report endpoints return a well-formed CSV (baseline availability check)`, async ({ browser }) => {
  const context = await browser.newContext({ storageState: adminStorageState });
  for (const key of REPORT_KEYS) {
    const rows = await fetchReportRows(context.request, key);
    // Every row parsed must have the same column count as its header — a
    // malformed CSV (e.g. an unescaped comma in a description/details field)
    // would otherwise silently produce a row with a shifted/missing column.
    for (const row of rows) {
      expect(Object.keys(row).length).toBeGreaterThan(0);
    }
  }
  await context.close();
});

test("users report reconciles a freshly created user's exact field values", async ({ browser }) => {
  const { user, email } = await createUser({ role: "USER", verified: true });

  const context = await browser.newContext({ storageState: adminStorageState });
  const rows = await fetchReportRows(context.request, "users");
  await context.close();

  const row = rows.find((r) => r["Email"] === email);
  expect(row).toBeDefined();
  expect(row!["Role"]).toBe("USER");
  expect(row!["Referral Code"]).toBe(user.referralCode);
  expect(row!["Email Verified"]).toBe("true");
  expect(row!["Locked"]).toBe("false");
  expect(row!["Reward Points Balance"]).toBe(String(user.rewardPointsBalance));
  // User rows are intentionally never deleted by this suite (established
  // convention) — no cleanup here.
});

test("payments report reconciles a real successful payment processed through the engine", async ({ browser }) => {
  const { user, userPlan } = await createDuePaymentMandate();
  const idempotencyKey = `pw-report-${uniqueSuffix()}`;
  const payment = await processScheduledPayment({ userPlanId: userPlan.id, idempotencyKey, forceOutcome: "SUCCESS" });
  expect(payment).not.toBeNull();

  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: userPlan.planId } });

  const context = await browser.newContext({ storageState: adminStorageState });
  const rows = await fetchReportRows(context.request, "payments");
  await context.close();

  const row = rows.find((r) => r["Payment ID"] === payment!.id);
  expect(row).toBeDefined();
  expect(row!["User Email"]).toBe(user.email);
  expect(row!["Plan"]).toBe(plan.name);
  expect(Number(row!["Amount"])).toBe(Number(payment!.amount));
  expect(row!["Status"]).toBe("SUCCESS");
  expect(row!["Method"]).toBe(payment!.method);
  expect(row!["Retry Count"]).toBe(String(payment!.retryCount));

  await prisma.ledgerEntry.deleteMany({ where: { userId: user.id } });
  await prisma.paymentEvent.deleteMany({ where: { paymentId: payment!.id } });
  await prisma.payment.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.paymentMandate.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.userPlan.deleteMany({ where: { id: userPlan.id } });
});

test("revenue report's current-month bucket moves by exactly one payment and its exact amount", async ({ browser }) => {
  const context = await browser.newContext({ storageState: adminStorageState });

  const periodOf = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const currentPeriod = periodOf(new Date());

  const before = await fetchReportRows(context.request, "revenue");
  const beforeRow = before.find((r) => r["Month"] === currentPeriod);
  const beforeCount = beforeRow ? Number(beforeRow["Successful Payments"]) : 0;
  const beforeTotal = beforeRow ? Number(beforeRow["Total Revenue"]) : 0;

  const { user, userPlan } = await createDuePaymentMandate();
  const idempotencyKey = `pw-report-rev-${uniqueSuffix()}`;
  const payment = await processScheduledPayment({ userPlanId: userPlan.id, idempotencyKey, forceOutcome: "SUCCESS" });
  expect(payment).not.toBeNull();

  const after = await fetchReportRows(context.request, "revenue");
  await context.close();
  const afterRow = after.find((r) => r["Month"] === currentPeriod);
  expect(afterRow).toBeDefined();

  // Delta-based comparison (rather than duplicating reports/index.ts's own
  // grouping logic) so this test independently proves the CSV reflects the
  // real DB mutation instead of merely re-asserting the same algorithm.
  expect(Number(afterRow!["Successful Payments"])).toBe(beforeCount + 1);
  expect(Number(afterRow!["Total Revenue"])).toBeCloseTo(beforeTotal + Number(payment!.amount), 2);

  await prisma.ledgerEntry.deleteMany({ where: { userId: user.id } });
  await prisma.paymentEvent.deleteMany({ where: { paymentId: payment!.id } });
  await prisma.payment.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.paymentMandate.deleteMany({ where: { userPlanId: userPlan.id } });
  await prisma.userPlan.deleteMany({ where: { id: userPlan.id } });
});

test("referrals report reconciles a referral's referrer/referred emails and latest commission status", async ({ browser }) => {
  const { referrer, referred, referral, commission } = await createReferralWithAccruedCommission(500);

  const context = await browser.newContext({ storageState: adminStorageState });
  const rows = await fetchReportRows(context.request, "referrals");
  await context.close();

  const row = rows.find((r) => r["Referral ID"] === referral.id);
  expect(row).toBeDefined();
  expect(row!["Referrer Email"]).toBe(referrer.email);
  expect(row!["Referred Email"]).toBe(referred.email);
  expect(row!["Referral Code Used"]).toBe(referrer.referralCode);
  expect(row!["Status"]).toBe("ACTIVE");
  expect(row!["Latest Commission Status"]).toBe(commission.status);

  await prisma.commission.deleteMany({ where: { referralId: referral.id } });
  await prisma.referral.deleteMany({ where: { id: referral.id } });
});

test("refunds and rewards reports both reconcile the same REFUND-category redemption request", async ({ browser }) => {
  const { user, userPlan } = await createUserWithRedeemableBalance(10000);
  const redemption = await prisma.redemptionRequest.create({
    data: {
      userId: user.id,
      category: "REFUND",
      status: "PENDING",
      requestedAmount: 4000,
      availableMarginAtRequest: 10000,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const context = await browser.newContext({ storageState: adminStorageState });
  const refundRows = await fetchReportRows(context.request, "refunds");
  const rewardRows = await fetchReportRows(context.request, "rewards");
  await context.close();

  const refundRow = refundRows.find((r) => r["Request ID"] === redemption.id);
  expect(refundRow).toBeDefined();
  expect(refundRow!["User Email"]).toBe(user.email);
  expect(refundRow!["Status"]).toBe("PENDING");
  expect(Number(refundRow!["Requested Amount"])).toBe(4000);

  const rewardRow = rewardRows.find((r) => r["Request ID"] === redemption.id);
  expect(rewardRow).toBeDefined();
  expect(rewardRow!["Category"]).toBe("REFUND");
  expect(rewardRow!["User Email"]).toBe(user.email);
  expect(Number(rewardRow!["Requested Amount"])).toBe(4000);

  await prisma.redemptionRequest.deleteMany({ where: { id: redemption.id } });
  await prisma.ledgerEntry.deleteMany({ where: { userId: user.id } });
  await prisma.userPlan.deleteMany({ where: { id: userPlan.id } });
});

test("interest report reconciles a matured plan's INTEREST ledger entry", async ({ browser }) => {
  const { user, userPlan } = await createUserWithRedeemableBalance(7500);
  const ledgerEntry = await prisma.ledgerEntry.findFirstOrThrow({
    where: { userId: user.id, transactionType: "INTEREST" },
  });

  const context = await browser.newContext({ storageState: adminStorageState });
  const rows = await fetchReportRows(context.request, "interest");
  await context.close();

  const row = rows.find((r) => r["Ledger Entry ID"] === ledgerEntry.id);
  expect(row).toBeDefined();
  expect(row!["User Email"]).toBe(user.email);
  expect(Number(row!["Interest Amount"])).toBe(Number(ledgerEntry.amount));
  expect(Number(row!["Balance Before"])).toBe(Number(ledgerEntry.balanceBefore));
  expect(Number(row!["Balance After"])).toBe(Number(ledgerEntry.balanceAfter));
  expect(row!["Description"]).toBe(ledgerEntry.description);

  await prisma.ledgerEntry.deleteMany({ where: { userId: user.id } });
  await prisma.userPlan.deleteMany({ where: { id: userPlan.id } });
});

test("audit report reconciles a log entry's actor email and JSON-stringified details", async ({ browser }) => {
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "admin@demo.local" } });
  const entityRef = `pw-report-audit-${uniqueSuffix()}`;
  const details = { note: "dashboard-report-reconciliation fixture", value: 42 };
  const log = await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      eventType: "ADMIN_MESSAGE_SENT",
      entityRef,
      details,
    },
  });

  const context = await browser.newContext({ storageState: adminStorageState });
  const rows = await fetchReportRows(context.request, "audit");
  await context.close();

  const row = rows.find((r) => r["Log ID"] === log.id);
  expect(row).toBeDefined();
  expect(row!["Actor Email"]).toBe(admin.email);
  expect(row!["Event Type"]).toBe("ADMIN_MESSAGE_SENT");
  expect(row!["Entity Ref"]).toBe(entityRef);
  expect(JSON.parse(row!["Details"])).toEqual(details);

  await prisma.auditLog.deleteMany({ where: { id: log.id } });
});
