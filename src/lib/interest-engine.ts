import { prisma } from "@/lib/prisma";
import { roundHalfUp } from "@/lib/money";
import { queueEmail } from "@/lib/providers/email";
import { createNotification } from "@/lib/providers/notification";
import type { InterestCalculationMethod } from "@prisma/client";

// BRD Rule XXVI: a CUSTOM interest formula is a parameterized expression
// restricted to these variables and the four basic arithmetic operators.
const ALLOWED_VARIABLES = ["Principal", "Rate", "Tenure", "ElapsedDays"] as const;
type FormulaVariables = { Principal: number; Rate: number; Tenure: number; ElapsedDays: number };

const MAX_FORMULA_LENGTH = 100;
const MAX_NESTING_DEPTH = 5;

export class InvalidFormulaError extends Error {}

type Token =
  | { type: "num"; value: number }
  | { type: "var"; name: (typeof ALLOWED_VARIABLES)[number] }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const numStr = expr.slice(i, j);
      if (!/^\d+(\.\d+)?$/.test(numStr)) {
        throw new InvalidFormulaError(`Invalid number literal: ${numStr}`);
      }
      tokens.push({ type: "num", value: Number(numStr) });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z]/.test(expr[j])) j++;
      const name = expr.slice(i, j);
      if (!(ALLOWED_VARIABLES as readonly string[]).includes(name)) {
        throw new InvalidFormulaError(
          `Unknown variable "${name}" — only Principal, Rate, Tenure, ElapsedDays are allowed`,
        );
      }
      tokens.push({ type: "var", name: name as (typeof ALLOWED_VARIABLES)[number] });
      i = j;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    throw new InvalidFormulaError(`Unexpected character "${ch}" in formula`);
  }
  return tokens;
}

// Recursive-descent parser/evaluator — deliberately hand-rolled instead of
// `eval`/`new Function` so a formula can never execute arbitrary code, per
// Rule XXVI's restriction to Principal/Rate/Tenure/ElapsedDays and + - * / ().
function parseAndEvaluate(tokens: Token[], vars: FormulaVariables): number {
  let pos = 0;
  let depth = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpr(): number {
    let value = parseTerm();
    while (peek()?.type === "op" && (peek() as { value: string }).value in { "+": 1, "-": 1 }) {
      const op = (consume() as { value: "+" | "-" }).value;
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (peek()?.type === "op" && (peek() as { value: string }).value in { "*": 1, "/": 1 }) {
      const op = (consume() as { value: "*" | "/" }).value;
      const rhs = parseFactor();
      if (op === "*") {
        value = value * rhs;
      } else {
        if (rhs === 0) throw new InvalidFormulaError("Formula divides by zero");
        value = value / rhs;
      }
    }
    return value;
  }

  function parseFactor(): number {
    const tok = peek();
    if (!tok) throw new InvalidFormulaError("Unexpected end of formula");
    if (tok.type === "num") {
      consume();
      return tok.value;
    }
    if (tok.type === "var") {
      consume();
      return vars[tok.name];
    }
    if (tok.type === "lparen") {
      consume();
      depth++;
      if (depth > MAX_NESTING_DEPTH) {
        throw new InvalidFormulaError(`Formula nesting exceeds max depth of ${MAX_NESTING_DEPTH}`);
      }
      const value = parseExpr();
      const close = consume();
      if (!close || close.type !== "rparen") {
        throw new InvalidFormulaError("Missing closing parenthesis");
      }
      depth--;
      return value;
    }
    throw new InvalidFormulaError("Unexpected token in formula");
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new InvalidFormulaError("Unexpected trailing characters in formula");
  return result;
}

export function evaluateCustomFormula(formula: string, vars: FormulaVariables): number {
  if (formula.length === 0) throw new InvalidFormulaError("Formula cannot be empty");
  if (formula.length > MAX_FORMULA_LENGTH) {
    throw new InvalidFormulaError(`Formula exceeds max length of ${MAX_FORMULA_LENGTH} characters`);
  }
  const tokens = tokenize(formula);
  const result = parseAndEvaluate(tokens, vars);
  if (!Number.isFinite(result) || Number.isNaN(result)) {
    throw new InvalidFormulaError("Formula produced a non-finite result");
  }
  if (result < 0) {
    throw new InvalidFormulaError("Formula produced a negative interest amount");
  }
  return result;
}

// Enforced BEFORE a CUSTOM formula may be saved onto an InterestCalculationMethod
// (Rule XXVI): run it against representative sample inputs so a bad formula
// (divide-by-zero, unknown variable, too deep, negative/NaN/Infinity result)
// is rejected at configuration time rather than at maturity-calculation time.
export function validateCustomFormula(formula: string): void {
  evaluateCustomFormula(formula, { Principal: 10000, Rate: 12, Tenure: 1, ElapsedDays: 365 });
  evaluateCustomFormula(formula, { Principal: 1, Rate: 0.01, Tenure: 0.1, ElapsedDays: 1 });
}

const COMPOUND_FREQUENCY_PER_YEAR: Record<string, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  HALF_YEARLY: 2,
  ANNUALLY: 1,
  DAILY: 365,
};

type InterestMethodInput = Pick<
  InterestCalculationMethod,
  "formulaType" | "ratePercent" | "tenureMonths" | "compoundingFrequency" | "customFormula"
>;

// Interest on Plan is applicable only at plan maturity — this is a single,
// one-time calculation, never accrued per-payment (BRD Interest Engine
// section). Appendix A worked example: Simple Interest = Principal x Rate x
// Tenure(years), e.g. Rs.10,000 x 12% x 1 = Rs.1,200.
export function calculateInterest(params: {
  method: InterestMethodInput;
  principal: number;
  elapsedDays: number;
}): number {
  const { method, principal, elapsedDays } = params;
  const rate = Number(method.ratePercent);
  const tenureYears = method.tenureMonths / 12;

  let raw: number;
  if (method.formulaType === "SIMPLE") {
    raw = principal * (rate / 100) * tenureYears;
  } else if (method.formulaType === "COMPOUND") {
    const n = COMPOUND_FREQUENCY_PER_YEAR[method.compoundingFrequency ?? "ANNUALLY"] ?? 1;
    raw = principal * Math.pow(1 + rate / 100 / n, n * tenureYears) - principal;
  } else if (method.formulaType === "CUSTOM") {
    if (!method.customFormula) throw new InvalidFormulaError("Custom formula is not configured");
    raw = evaluateCustomFormula(method.customFormula, {
      Principal: principal,
      Rate: rate,
      Tenure: tenureYears,
      ElapsedDays: elapsedDays,
    });
  } else {
    throw new InvalidFormulaError(`Unsupported interest formula type: ${method.formulaType}`);
  }

  if (!Number.isFinite(raw) || Number.isNaN(raw) || raw < 0) raw = 0;
  return roundHalfUp(raw, 2);
}

// Prototype maturity transition. There is no real cron/queue (Master Prompt:
// no background job infra), so this is an admin-triggerable batch action —
// the same convention as the AutoPay simulator's "run due charges" button.
// For each UserPlan whose maturityDate has passed: calculates interest exactly
// once (using the method/version snapshotted at subscription time, per Rule
// XXVI(f)), posts it as a single INTEREST ledger entry, and transitions the
// plan to MATURED so redemption-engine.ts can unlock its principal.
export async function runMaturityTransitions() {
  const now = new Date();
  const dueUserPlans = await prisma.userPlan.findMany({
    where: {
      status: { in: ["ACTIVE", "DISCONTINUED"] },
      maturityDate: { lte: now },
    },
    include: { interestMethod: true, user: true, plan: true },
  });

  const results: { userPlanId: string; interestAmount: number }[] = [];

  for (const userPlan of dueUserPlans) {
    const interestAmount = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction so concurrent/duplicate batch runs
      // never double-post the one-time maturity interest entry.
      const fresh = await tx.userPlan.findUniqueOrThrow({ where: { id: userPlan.id } });
      if (fresh.status !== "ACTIVE" && fresh.status !== "DISCONTINUED") return null;
      if (fresh.maturityDate > now) return null;

      const principal = Number(fresh.principalPaid);
      const elapsedDays = Math.max(
        0,
        Math.round((fresh.maturityDate.getTime() - fresh.startDate.getTime()) / 86_400_000),
      );

      const interest =
        principal > 0
          ? calculateInterest({ method: userPlan.interestMethod, principal, elapsedDays })
          : 0;

      if (interest > 0) {
        const lastEntry = await tx.ledgerEntry.findFirst({
          where: { userId: fresh.userId },
          orderBy: { transactionTimestamp: "desc" },
        });
        const balanceBefore = lastEntry ? Number(lastEntry.balanceAfter) : 0;
        // Round Half Up per BRD Rule XXXIII/XXXIV: adding two already-rounded
        // 2-decimal values can still produce IEEE-754 noise (e.g. 0.1 + 0.2),
        // which would otherwise persist into the ledger's stored balance.
        const balanceAfter = roundHalfUp(balanceBefore + interest);

        await tx.ledgerEntry.create({
          data: {
            userId: fresh.userId,
            userPlanId: fresh.id,
            transactionType: "INTEREST",
            amount: interest,
            balanceBefore,
            balanceAfter,
            description: `Maturity interest for ${userPlan.plan.name} (${fresh.id})`,
            interestMethodId: fresh.interestMethodId,
            interestMethodVersion: fresh.interestMethodVersion,
          },
        });
      }

      await tx.userPlan.update({ where: { id: fresh.id }, data: { status: "MATURED" } });

      return interest;
    });

    if (interestAmount === null) continue;

    await createNotification({
      userId: userPlan.userId,
      type: "PLAN_MATURITY",
      title: "Plan matured",
      message:
        interestAmount > 0
          ? `Your ${userPlan.plan.name} plan has matured. Interest of ₹${interestAmount.toFixed(2)} has been credited to your redeemable balance.`
          : `Your ${userPlan.plan.name} plan has matured.`,
    });

    await queueEmail({
      recipient: userPlan.user.email,
      subject: "Your plan has matured",
      body:
        interestAmount > 0
          ? `Your ${userPlan.plan.name} plan has matured. Interest of ₹${interestAmount.toFixed(2)} has been credited to your redeemable balance.`
          : `Your ${userPlan.plan.name} plan has matured.`,
      templateType: "PLAN_MATURITY",
      relatedEntityRef: userPlan.id,
    });

    results.push({ userPlanId: userPlan.id, interestAmount });
  }

  return results;
}
