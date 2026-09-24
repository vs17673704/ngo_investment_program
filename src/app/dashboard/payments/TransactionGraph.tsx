"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { formatINR } from "@/lib/format";

export type GraphPayment = { amount: number; dateIso: string };

type Granularity = "daily" | "weekly" | "monthly";
type Bucket = { key: number; label: string; total: number; count: number };

const GRANULARITIES: { key: Granularity; label: string; periods: number }[] = [
  { key: "daily", label: "Daily (last 14 days)", periods: 14 },
  { key: "weekly", label: "Weekly (last 8 weeks)", periods: 8 },
  { key: "monthly", label: "Monthly (last 6 months)", periods: 6 },
];

const GRID_LINES = [0.25, 0.5, 0.75];
const BAR_MAX_HEIGHT = 96;

function compactINR(value: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(d: Date) {
  const copy = startOfDay(d);
  const day = copy.getDay();
  // Week starts Monday.
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function bucketFor(date: Date, granularity: Granularity) {
  if (granularity === "daily") return startOfDay(date).getTime();
  if (granularity === "weekly") return startOfWeek(date).getTime();
  return startOfMonth(date).getTime();
}

function labelFor(bucketStart: number, granularity: Granularity) {
  const d = new Date(bucketStart);
  if (granularity === "monthly") return d.toLocaleDateString("en-IN", { year: "numeric", month: "short" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function rangeLabelFor(bucketStart: number, granularity: Granularity) {
  const d = new Date(bucketStart);
  if (granularity === "daily") return d.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "short", day: "numeric" });
  if (granularity === "monthly") return d.toLocaleDateString("en-IN", { year: "numeric", month: "long" });
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return `${d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}`;
}

function buildBuckets(payments: GraphPayment[], granularity: Granularity, periods: number): Bucket[] {
  const now = new Date();
  const currentBucketStart =
    granularity === "daily" ? startOfDay(now) : granularity === "weekly" ? startOfWeek(now) : startOfMonth(now);

  const buckets: Bucket[] = [];
  for (let i = periods - 1; i >= 0; i--) {
    const d = new Date(currentBucketStart);
    if (granularity === "daily") d.setDate(d.getDate() - i);
    else if (granularity === "weekly") d.setDate(d.getDate() - i * 7);
    else d.setMonth(d.getMonth() - i);
    buckets.push({ key: d.getTime(), label: labelFor(d.getTime(), granularity), total: 0, count: 0 });
  }

  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const p of payments) {
    const key = bucketFor(new Date(p.dateIso), granularity);
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.total += p.amount;
      bucket.count += 1;
    }
  }

  return buckets;
}

export function TransactionGraph({ payments }: { payments: GraphPayment[] }) {
  const [granularity, setGranularity] = useState<Granularity>("monthly");

  const config = GRANULARITIES.find((g) => g.key === granularity)!;
  const buckets = useMemo(() => buildBuckets(payments, granularity, config.periods), [payments, granularity, config.periods]);
  const currentBucketKey = buckets.length > 0 ? buckets[buckets.length - 1].key : null;

  const hasAnyTotal = buckets.some((b) => b.total > 0);
  const maxTotal = Math.max(1, ...buckets.map((b) => b.total));
  const periodTotal = buckets.reduce((sum, b) => sum + b.total, 0);
  const periodCount = buckets.reduce((sum, b) => sum + b.count, 0);
  const average = periodCount > 0 ? periodTotal / buckets.length : 0;
  const peak = buckets.reduce((best, b) => (b.total > best.total ? b : best), buckets[0]);

  return (
    <Card as="section" aria-label="Transaction Graph" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold tracking-tight text-primary">Transaction Graph</h2>
        <div className="flex h-9 items-center rounded-lg border border-outline-variant bg-surface-container-low px-2">
          <Icon name="calendar_month" className="mr-1.5 text-[16px] text-on-surface-variant" />
          <label className="sr-only" htmlFor="transaction-graph-granularity">
            Group transactions by
          </label>
          <select
            id="transaction-graph-granularity"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
            className="cursor-pointer bg-transparent pr-1 text-xs font-medium text-on-surface focus:outline-none"
          >
            {GRANULARITIES.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasAnyTotal ? (
        <>
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-container-low p-2 text-center">
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase">Total</p>
              <p className="text-sm font-bold text-primary">{formatINR(periodTotal)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase">
                Avg / {granularity === "daily" ? "day" : granularity === "weekly" ? "week" : "month"}
              </p>
              <p className="text-sm font-bold text-primary">{formatINR(average)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-on-surface-variant uppercase">Transactions</p>
              <p className="text-sm font-bold text-primary">{periodCount}</p>
            </div>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="relative flex items-end justify-center gap-3 pt-4" data-testid="transaction-graph" style={{ minHeight: BAR_MAX_HEIGHT + 16 }}>
              {GRID_LINES.map((fraction) => (
                <div
                  key={fraction}
                  aria-hidden
                  className="absolute right-0 left-0 border-t border-dashed border-outline-variant/60"
                  style={{ bottom: fraction * BAR_MAX_HEIGHT + 16 }}
                />
              ))}
              {buckets.map((b) => {
                const isCurrent = b.key === currentBucketKey;
                const isPeak = b.total > 0 && b.key === peak.key;
                return (
                  <div key={b.key} className="relative z-10 flex w-11 shrink-0 flex-col items-center gap-1">
                    {b.total > 0 && (
                      <span className="text-[9px] leading-none font-semibold whitespace-nowrap text-on-surface-variant">
                        {compactINR(b.total)}
                      </span>
                    )}
                    <div
                      className={`w-full max-w-8 rounded-t transition-all ${
                        isPeak ? "bg-primary" : "bg-secondary"
                      } ${isCurrent ? "ring-2 ring-secondary ring-offset-1 ring-offset-surface-container-lowest" : ""}`}
                      style={{ height: `${Math.max(4, (b.total / maxTotal) * BAR_MAX_HEIGHT)}px` }}
                      title={`${rangeLabelFor(b.key, granularity)}: ${formatINR(b.total)} across ${b.count} transaction${b.count === 1 ? "" : "s"}`}
                    />
                    <span className={`text-[10px] whitespace-nowrap ${isCurrent ? "font-semibold text-primary" : "text-on-surface-variant"}`}>
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[10px] text-on-surface-variant">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-secondary" /> Period total
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-primary" /> Peak period
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm ring-2 ring-secondary" /> Current period
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-on-surface-variant">No successful payments in this period.</p>
      )}
    </Card>
  );
}
