import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getPublishedTheme } from "@/lib/theme";
import { existingPublicAsset } from "@/lib/branding-assets";

const FEATURES = [
  {
    icon: "check_circle",
    title: "Admin-Configured Investment Plans",
    body: "Defined tenures (6M to 3Y) with structured monthly or lumpsum returns.",
  },
  {
    icon: "check_circle",
    title: "Razorpay AutoPay & eMandate Protection",
    body: "Automated recurring payment verification with secure webhook validation.",
  },
  {
    icon: "check_circle",
    title: "Unified Financial Ledger",
    body: "Transparent available margin, tier bonus calculations & payout audit trails.",
  },
];

const POSITION_MAP: Record<string, string> = {
  CENTER: "center",
  TOP: "top",
  RIGHT: "right",
  BOTTOM: "bottom",
  LEFT: "left",
};
const SIZE_MAP: Record<string, string> = {
  COVER: "cover",
  CONTAIN: "contain",
  AUTO: "auto",
};

export async function AuthShell({ children }: { children: React.ReactNode }) {
  const theme = await getPublishedTheme();
  const appName = theme.appName?.trim() || process.env.NEXT_PUBLIC_APP_NAME || "NexVest";
  const loginLogoUrl = existingPublicAsset(theme.loginLogoUrl);
  const wallpaperUrl = theme.loginBackgroundType === "IMAGE" ? existingPublicAsset(theme.loginBackgroundUrl) : null;

  const panelStyle: React.CSSProperties =
    wallpaperUrl
      ? {
          backgroundImage: `url(${wallpaperUrl})`,
          backgroundPosition: POSITION_MAP[theme.loginBackgroundPosition] ?? "center",
          backgroundSize: SIZE_MAP[theme.loginBackgroundSize] ?? "cover",
          backgroundRepeat: "no-repeat",
        }
      : theme.loginBackgroundType === "GRADIENT"
        ? { backgroundImage: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})` }
        : {};

  return (
    <div className="flex flex-1 flex-col bg-surface">
      <div className="flex h-14 w-full items-center justify-between gap-2 bg-surface-container-lowest/80 px-4 shadow-sm backdrop-blur-md sm:px-6">
        {/* min-w-0 + shrink here, and min-w-0 + truncate on the text span:
            without these, a long configurable theme.appName (e.g. "Referral
            & Reward Program") can't shrink below its intrinsic width, so at
            narrow viewports it wraps this fixed-height row to two lines and
            pushes/overlaps the "Secure Portal" badge and "Back to home" link
            — same root cause and fix as DashboardShell.tsx/AdminShell.tsx. */}
        <div className="flex min-w-0 shrink items-center gap-2 text-on-surface">
          {loginLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={loginLogoUrl} alt={appName} className="h-7 w-auto shrink-0" />
          ) : (
            <span className="min-w-0 truncate font-heading text-lg font-bold tracking-tight">{appName}</span>
          )}
          <span className="shrink-0 rounded bg-surface-container px-2 py-0.5 text-xs font-medium tracking-wider text-on-surface-variant uppercase">
            Secure Portal
          </span>
        </div>
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
        >
          <Icon name="arrow_back" className="text-[18px]" />
          <span className="hidden sm:inline">Back to home</span>
        </Link>
      </div>

      <div className="w-full flex-1 px-4 py-10 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          <div
            style={panelStyle}
            className="relative hidden flex-col justify-between overflow-hidden rounded-xl bg-primary-container p-8 text-inverse-on-surface shadow-md lg:col-span-6 lg:flex"
          >
            {theme.loginOverlayEnabled && (
              <div
                className="absolute inset-0 z-0"
                style={{ backgroundColor: theme.loginOverlayColor, opacity: theme.loginOverlayOpacity / 100 }}
              />
            )}
            <div className="relative z-10 flex flex-col gap-6">
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-surface-container-highest/15 px-3 py-1 text-xs font-medium tracking-wider uppercase">
                <span className="h-2 w-2 rounded-full bg-secondary-fixed" />
                Institutional Investment Platform
              </div>
              <div className="space-y-2">
                <h1 className="font-heading text-3xl leading-tight font-bold tracking-tight">
                  {theme.loginTitle?.trim() || `Welcome to ${appName}`}
                </h1>
                <p className="max-w-lg text-base text-inverse-on-surface/80">
                  {theme.loginSubtitle?.trim() || "High-Trust Referral & Reward Investment Platform"}
                </p>
              </div>
              <div className="space-y-4 rounded-xl bg-inverse-surface/60 p-6 shadow-sm backdrop-blur-md">
                <div className="text-xs font-semibold tracking-wider text-inverse-on-surface/60 uppercase">
                  Platform Architecture &amp; Safeguards
                </div>
                <div className="space-y-3">
                  {FEATURES.map((f) => (
                    <div key={f.title} className="flex items-start gap-3">
                      <Icon name={f.icon} className="mt-0.5 shrink-0 text-[20px] text-secondary-fixed" />
                      <div>
                        <span className="block font-medium text-inverse-on-surface">{f.title}</span>
                        <span className="text-sm text-inverse-on-surface/70">{f.body}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="relative z-10 flex items-center justify-between pt-8 text-sm text-inverse-on-surface/60">
              <div className="flex items-center gap-2">
                <Icon name="lock_clock" className="text-[18px] text-secondary-fixed" />
                <span>{theme.supportText?.trim() || "Security: Email OTP 2FA & Bcrypt Hashing"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center lg:col-span-6">
            <div className="flex w-full max-w-lg flex-col justify-center rounded-xl bg-surface-container-lowest p-6 shadow-sm sm:p-10">
              {children}
            </div>
          </div>
        </div>
        {theme.footerText?.trim() && (
          <p className="mx-auto mt-6 max-w-6xl text-center text-xs text-on-surface-variant">{theme.footerText}</p>
        )}
      </div>
    </div>
  );
}
