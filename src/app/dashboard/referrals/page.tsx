import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getUserDashboardData } from "@/lib/dashboard";
import { withdrawCommissionAction } from "@/app/admin/commissions/actions";
import RegenerateCodeForm from "./RegenerateCodeForm";
import { PeopleYouReferred } from "./PeopleYouReferred";
import { CopyButton } from "@/components/CopyButton";
import { formatINR } from "@/lib/format";

export default async function ReferralsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Prefer an explicitly configured public URL, but otherwise derive the
  // origin from the incoming request so the share link always matches
  // whatever domain the app is actually deployed on (never a hardcoded
  // localhost placeholder).
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? (host ? `${proto}://${host}` : "");

  const [data, referrals, withdrawable] = await Promise.all([
    getUserDashboardData(session.sub),
    prisma.referral.findMany({
      where: { referrerUserId: session.sub },
      include: {
        referred: {
          select: {
            email: true,
            userPlans: {
              where: { status: "ACTIVE" },
              select: {
                id: true,
                paymentAmount: true,
                commissionPercentSnapshot: true,
                plan: { select: { name: true } },
              },
            },
          },
        },
        commissions: {
          select: {
            id: true,
            amount: true,
            status: true,
            commissionType: true,
            accrualDate: true,
            userPlan: { select: { plan: { select: { name: true } } } },
          },
          orderBy: { accrualDate: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commission.findMany({
      where: {
        referral: { referrerUserId: session.sub },
        status: "AVAILABLE_FOR_WITHDRAWAL",
      },
      orderBy: { creditDate: "asc" },
    }),
  ]);

  const user = data.user;

  // Design.md 3.5 summary metrics. "Accrued"/"total earned" are the lifetime
  // sum (every commission starts ACCRUED); Approved/Pending are current-stage
  // breakdowns; "Credited" covers anything whose creditDate has been set
  // (AVAILABLE_FOR_WITHDRAWAL or WITHDRAWN — this codebase has no separate
  // in-flight CREDITED stage, see commission-engine.ts's lifecycle comment).
  const allCommissions = referrals.flatMap((r) => r.commissions);
  const sumWhere = (pred: (c: (typeof allCommissions)[number]) => boolean) =>
    allCommissions.filter(pred).reduce((total, c) => total + Number(c.amount), 0);
  const totalAccrued = allCommissions.reduce((total, c) => total + Number(c.amount), 0);
  const totalApproved = sumWhere((c) => c.status === "APPROVED");
  const totalCredited = sumWhere((c) => c.status === "AVAILABLE_FOR_WITHDRAWAL" || c.status === "WITHDRAWN");
  const totalWithdrawn = sumWhere((c) => c.status === "WITHDRAWN");
  const totalPending = sumWhere((c) => c.status === "ACCRUED");
  const totalUpcoming = referrals
    .filter((r) => r.status === "ACTIVE")
    .flatMap((r) => r.referred.userPlans)
    .reduce((total, up) => total + (Number(up.commissionPercentSnapshot) / 100) * Number(up.paymentAmount), 0);

  const summaryMetrics = [
    { label: "Total Commission Accrued", value: totalAccrued },
    { label: "Total Commission Approved", value: totalApproved },
    { label: "Total Commission Credited", value: totalCredited },
    { label: "Total Commission Withdrawn", value: totalWithdrawn },
    { label: "Total Pending Commission", value: totalPending },
    { label: "Total commission earned", value: totalAccrued },
    { label: "Upcoming commission from active plans", value: totalUpcoming },
  ];

  return (
    <>
      <div className="flex w-full flex-col gap-6">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Referrals</h1>

        <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Your referral code</p>
          <div className="mt-1 flex items-center gap-2">
            <CopyButton value={user.referralCode} label="Copy referral code" />
            <p className="font-mono text-2xl font-bold tracking-wider text-primary">{user.referralCode}</p>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <CopyButton
              value={`${baseUrl}/register?ref=${user.referralCode}`}
              label="Copy share link"
            />
            <span>
              Share link: {baseUrl}/register?ref=
              {user.referralCode}
            </span>
          </div>
          <RegenerateCodeForm />
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {summaryMetrics.map((m) => (
            <div key={m.label} className="rounded-xl bg-surface-container-lowest p-3 shadow-sm">
              <p className="text-[11px] font-semibold tracking-wider text-on-surface-variant uppercase">{m.label}</p>
              <p className="mt-1 text-lg font-bold text-primary">{formatINR(m.value)}</p>
            </div>
          ))}
        </section>

        {withdrawable.length > 0 && (
          <section className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
            <h2 className="font-heading text-lg font-semibold text-primary">Available for withdrawal</h2>
            <ul className="flex flex-col gap-2">
              {withdrawable.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-container p-3 text-sm">
                  <span className="text-on-surface">
                    {formatINR(c.amount)} · {c.commissionType}
                  </span>
                  <form action={withdrawCommissionAction.bind(null, c.id)}>
                    <button
                      type="submit"
                      className="flex min-h-touch items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary shadow-sm transition-all hover:bg-primary-container"
                    >
                      Withdraw
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        <PeopleYouReferred
          referrals={referrals.map((r) => ({
            id: r.id,
            email: r.referred.email,
            status: r.status,
            expiryDateLabel: r.expiryDate.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }),
            commissions: r.commissions.map((c) => ({
              id: c.id,
              amount: c.amount.toString(),
              commissionType: c.commissionType,
              status: c.status,
              accrualDateLabel: c.accrualDate.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }),
              planName: c.userPlan?.plan.name ?? null,
            })),
            upcomingPlans:
              r.status === "ACTIVE"
                ? r.referred.userPlans.map((up) => ({
                    id: up.id,
                    planName: up.plan.name,
                    amount: (Number(up.commissionPercentSnapshot) / 100) * Number(up.paymentAmount),
                  }))
                : [],
          }))}
        />
      </div>
    </>
  );
}
