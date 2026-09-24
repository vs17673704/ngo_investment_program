// BRD Rules XLVII/XLVIII: shared numeric range generator used by both the
// admin UI (client-side live preview) and the Server Actions that persist the
// result (server-side recomputation — never trust a client-submitted list
// without regenerating/validating it here).

export type CadenceUnit = "DAY" | "WEEK" | "MONTH";
export type Cadence = { unit: CadenceUnit; interval: number };

export function generateNumericRange(start: number, interval: number, count: number): number[] {
  if (!Number.isFinite(start) || start <= 0) return [];
  if (!Number.isFinite(interval) || interval <= 0) return [];
  if (!Number.isInteger(count) || count <= 0) return [];
  return Array.from({ length: count }, (_, i) => start + i * interval);
}

export function generateCadenceRange(unit: CadenceUnit, start: number, interval: number, count: number): Cadence[] {
  return generateNumericRange(start, interval, count).map((n) => ({ unit, interval: n }));
}

export function formatCadence(c: Cadence): string {
  const unitLabel = c.unit === "DAY" ? "Day" : c.unit === "WEEK" ? "Week" : "Month";
  return `Every ${c.interval} ${unitLabel}${c.interval === 1 ? "" : "s"}`;
}

export function cadenceKey(c: Cadence): string {
  return `${c.unit}:${c.interval}`;
}

export function parseCadenceKey(key: string): Cadence | null {
  const [unit, intervalRaw] = key.split(":");
  const interval = Number(intervalRaw);
  if ((unit !== "DAY" && unit !== "WEEK" && unit !== "MONTH") || !Number.isInteger(interval) || interval <= 0) {
    return null;
  }
  return { unit, interval };
}

export function isSameCadence(a: Cadence, b: Cadence): boolean {
  return a.unit === b.unit && a.interval === b.interval;
}

export function dedupeCadences(cadences: Cadence[]): Cadence[] {
  const seen = new Set<string>();
  const result: Cadence[] = [];
  for (const c of cadences) {
    const key = cadenceKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(c);
  }
  return result;
}
