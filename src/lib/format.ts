// Matches the existing inline `₹${Number(x).toFixed(2)}` convention used
// throughout the app (see src/app/admin, src/app/dashboard) — a shared
// helper for the same output, not a new formatting behavior.
export function formatINR(value: number | string | { toString(): string }): string {
  return `₹${Number(value).toFixed(2)}`;
}
