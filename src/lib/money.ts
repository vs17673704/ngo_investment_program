// BRD Rule XXXIII/XXXIV: all monetary calculations (interest, commission,
// redemption, balances, payments, ledger) use Round Half Up to 2 decimals —
// a third decimal of exactly 5 or more always rounds the second decimal up.
// Plain `toFixed` is not used directly because it exhibits float-representation
// bugs (e.g. `1.005.toFixed(2) === "1.00"`), so we normalize through a
// higher-precision fixed string first to strip binary floating-point noise.
export function roundHalfUp(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const negative = value < 0;
  const abs = Math.abs(value);
  const normalized = Number(abs.toFixed(decimals + 6));
  const shifted = normalized * factor;
  const rounded = Math.floor(shifted + 0.5 + 1e-9);
  const result = rounded / factor;
  return negative ? -result : result;
}

// BRD Rule XIII/XXXIII Reward Points Rounding Exception: Reward Points are
// non-monetary whole-number units and always round UP (ceiling), never via
// the monetary Round Half Up rule.
export function ceilToWholeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil(Number(value.toFixed(6)));
}
