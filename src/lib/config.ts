import { prisma } from "@/lib/prisma";

// Prototype-wide configurable defaults.
// BRD leaves these as admin-configurable ranges without a fixed numeric default;
// for this prototype we pick the value described as the default in BRD.md and
// document it here so it is easy to find and change. Admin overrides are
// stored in the SiteSetting table (see getSettings/updateSettings below) and
// take precedence over these hardcoded defaults.

export const REFERRAL_VALIDITY_DAYS_DEFAULT = 365; // BRD range: 30-1095 days
export const REDEMPTION_EXPIRY_DAYS_DEFAULT = 7; // BRD range: 1-30 days
export const PAYMENT_GRACE_PERIOD_HOURS_DEFAULT = 24; // BRD range: 0-168 hours
export const PAYMENT_RETRY_COUNT_DEFAULT = 3; // BRD range: 1-5 retries
export const PAYMENT_RETRY_INTERVAL_HOURS_DEFAULT = 24; // BRD range: 1-72 hours
export const MANUAL_PAYMENT_FALLBACK_HOURS_DEFAULT = 24; // BRD range: 1-72 hours
export const SHORTFALL_VERIFICATION_SLA_HOURS_DEFAULT = 24; // BRD range: 1-72 hours
export const COMMISSION_RECURRING_CYCLE_LENGTH = 4; // every 4 consecutive successful payments
// BRD Rule XIII: Admin may configure Reward Percentage per plan OR as one
// common percentage across all plans. Used only when the user's applicable
// UserPlan has no plan-specific rewardPercentSnapshot. BRD range: 0.00-100.00%.
export const COMMON_REWARD_PERCENT_DEFAULT = 5;
// BRD Security: 6-digit OTP, 5 min TTL, no verification attempt limit
// (BRD Rule XLI), 3 resends per 15 min.
export const OTP_TTL_MINUTES_DEFAULT = 5; // BRD range: 1-30 minutes
export const PASSWORD_RESET_TTL_MINUTES_DEFAULT = 30; // BRD range: 5-120 minutes
export const OTP_MAX_RESENDS_DEFAULT = 3; // BRD range: 1-10 resends
export const OTP_RESEND_WINDOW_MINUTES_DEFAULT = 15; // BRD range: 5-120 minutes
// BRD Rule XXXIX.8: proposed default retention period for General Enquiry
// records (including submitter PII), admin-configurable.
export const GENERAL_ENQUIRY_RETENTION_MONTHS_DEFAULT = 24;
// BRD Rule XXXVIII: reminder timing is admin-configurable; BRD gives no fixed
// numeric default, so this prototype picks 3 days as a reasonable lead time.
export const INSTALMENT_REMINDER_LEAD_DAYS_DEFAULT = 3; // proposed range: 1-14 days

export const SETTINGS_SCHEMA = {
  referralValidityDays: {
    label: "Referral Validity (days)",
    default: REFERRAL_VALIDITY_DAYS_DEFAULT,
    min: 30,
    max: 1095,
  },
  redemptionExpiryDays: {
    label: "Redemption Request Expiry (days)",
    default: REDEMPTION_EXPIRY_DAYS_DEFAULT,
    min: 1,
    max: 30,
  },
  paymentGracePeriodHours: {
    label: "Payment Grace Period (hours)",
    default: PAYMENT_GRACE_PERIOD_HOURS_DEFAULT,
    min: 0,
    max: 168,
  },
  paymentRetryCount: {
    label: "Max Automatic Retry Attempts",
    default: PAYMENT_RETRY_COUNT_DEFAULT,
    min: 1,
    max: 5,
  },
  paymentRetryIntervalHours: {
    label: "Retry Interval (hours)",
    default: PAYMENT_RETRY_INTERVAL_HOURS_DEFAULT,
    min: 1,
    max: 72,
  },
  manualPaymentWindowHours: {
    label: "Manual Payment Window (hours)",
    default: MANUAL_PAYMENT_FALLBACK_HOURS_DEFAULT,
    min: 1,
    max: 72,
  },
  shortfallVerificationSlaHours: {
    label: "Shortfall Verification SLA (hours)",
    default: SHORTFALL_VERIFICATION_SLA_HOURS_DEFAULT,
    min: 1,
    max: 72,
  },
  commissionRecurringCycleLength: {
    label: "Commission Recurring Cycle Length (payments)",
    default: COMMISSION_RECURRING_CYCLE_LENGTH,
    min: 1,
    max: 24,
  },
  commonRewardPercent: {
    label: "Common Reward Percentage (%)",
    default: COMMON_REWARD_PERCENT_DEFAULT,
    min: 0,
    max: 100,
  },
  otpTtlMinutes: {
    label: "OTP Validity (minutes)",
    default: OTP_TTL_MINUTES_DEFAULT,
    min: 1,
    max: 30,
  },
  passwordResetTtlMinutes: {
    label: "Password Reset OTP Validity (minutes)",
    default: PASSWORD_RESET_TTL_MINUTES_DEFAULT,
    min: 5,
    max: 120,
  },
  otpMaxResends: {
    label: "Max OTP Resends per Window",
    default: OTP_MAX_RESENDS_DEFAULT,
    min: 1,
    max: 10,
  },
  otpResendWindowMinutes: {
    label: "OTP Resend Window (minutes)",
    default: OTP_RESEND_WINDOW_MINUTES_DEFAULT,
    min: 5,
    max: 120,
  },
  generalEnquiryRetentionMonths: {
    label: "General Enquiry Retention (months)",
    default: GENERAL_ENQUIRY_RETENTION_MONTHS_DEFAULT,
    min: 1,
    max: 120,
  },
  instalmentReminderLeadDays: {
    label: "Upcoming Instalment Reminder Lead Time (days)",
    default: INSTALMENT_REMINDER_LEAD_DAYS_DEFAULT,
    min: 1,
    max: 14,
  },
} as const;

export type SettingKey = keyof typeof SETTINGS_SCHEMA;

export type Settings = { [K in SettingKey]: number };

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.siteSetting.findMany();
  const overrides = new Map(rows.map((r) => [r.key, r.value]));

  const result = {} as Settings;
  for (const key of Object.keys(SETTINGS_SCHEMA) as SettingKey[]) {
    const schema = SETTINGS_SCHEMA[key];
    const raw = overrides.get(key);
    const parsed = raw !== undefined ? Number(raw) : NaN;
    result[key] = Number.isFinite(parsed) ? parsed : schema.default;
  }
  return result;
}

export function validateSetting(key: SettingKey, value: number): string | null {
  const schema = SETTINGS_SCHEMA[key];
  if (!Number.isFinite(value)) return `${schema.label} must be a number`;
  if (!Number.isInteger(value)) return `${schema.label} must be a whole number`;
  if (value < schema.min || value > schema.max) {
    return `${schema.label} must be between ${schema.min} and ${schema.max}`;
  }
  return null;
}

export async function updateSettings(input: Partial<Record<SettingKey, number>>) {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(input) as [SettingKey, number][]) {
    const error = validateSetting(key, value);
    if (error) errors.push(error);
  }
  if (errors.length > 0) throw new Error(errors.join("; "));

  await prisma.$transaction(
    Object.entries(input).map(([key, value]) =>
      prisma.siteSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      }),
    ),
  );
}
