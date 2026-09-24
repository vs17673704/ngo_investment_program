import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resolveLedgerUser, buildLedgerWhere } from "@/lib/ledger";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Icon } from "@/components/Icon";
import { SearchFieldWithClear } from "@/components/SearchFieldWithClear";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { Card } from "@/components/ui/Card";
import { fieldClassName } from "@/components/ui/fieldStyles";
import { buttonStyles } from "@/components/ui/Button";

const PAGE_SIZE = 50;

const TYPE_OPTIONS = [
  { value: "ALL", label: "All types" },
  { value: "PLAN_PAYMENT", label: "Plan Payment" },
  { value: "INTEREST", label: "Interest" },
  { value: "COMMISSION", label: "Commission" },
  { value: "REDEMPTION_COURSE", label: "Redemption — Course" },
  { value: "REDEMPTION_REFUND", label: "Redemption — Refund" },
  { value: "REDEMPTION_REINVESTMENT", label: "Redemption — Reinvestment" },
  { value: "REDEMPTION_DONATION", label: "Redemption — Donation" },
  { value: "REDEMPTION_FRANCHISEE", label: "Redemption — Franchisee" },
  { value: "REDEMPTION_GADGETS", label: "Redemption — Gadgets" },
];

export default async function AdminLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; type?: string; from?: string; to?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const { email, type, from, to, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const user = await resolveLedgerUser(email);
  const emailNotFound = Boolean(email?.trim()) && !user;

  const filterParams = new URLSearchParams();
  if (email) filterParams.set("email", email);
  if (type) filterParams.set("type", type);
  if (from) filterParams.set("from", from);
  if (to) filterParams.set("to", to);
  const exportHref = `/api/admin/ledger/export?${filterParams.toString()}`;

  let entries: Awaited<ReturnType<typeof prisma.ledgerEntry.findMany<{ include: { user: true } }>>> = [];
  let total = 0;
  let latestBalance: string | null = null;

  // An unresolved email means the search matched nobody: show that as an
  // explicit "not found" state rather than silently falling back to the
  // unfiltered all-users view, which would be confusing after a typo.
  if (!emailNotFound) {
    const where = buildLedgerWhere(user?.id, { type, from, to });
    const [rows, count, latest] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        include: { user: true },
        orderBy: { transactionTimestamp: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.ledgerEntry.count({ where }),
      user
        ? prisma.ledgerEntry.findFirst({ where: { userId: user.id }, orderBy: { transactionTimestamp: "desc" } })
        : Promise.resolve(null),
    ]);
    entries = rows;
    total = count;
    latestBalance = user ? Number(latest?.balanceAfter ?? 0).toFixed(2) : null;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(targetPage: number) {
    const params = new URLSearchParams(filterParams);
    params.set("page", String(targetPage));
    return `/admin/ledger?${params.toString()}`;
  }

  return (
    <>
      <AdminPageHeader title="Unified Ledger" />

      <form className="flex flex-wrap items-end gap-2" method="get">
        <SearchFieldWithClear
          id="email"
          name="email"
          label="User email (optional)"
          defaultValue={email}
          placeholder="user@example.com"
        />
        <AutoSubmitSelect id="type" name="type" label="Transaction type" defaultValue={type ?? "ALL"} options={TYPE_OPTIONS} />
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs font-medium text-on-surface-variant">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={from} className={fieldClassName()} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs font-medium text-on-surface-variant">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={to} className={fieldClassName()} />
        </div>
        <button type="submit" className={buttonStyles("primary")}>
          Search
        </button>
      </form>

      {emailNotFound ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
          <Icon name="person_off" className="text-[32px] text-on-surface-variant" />
          <p className="text-sm text-on-surface-variant">No user found matching &quot;{email}&quot;.</p>
        </div>
      ) : (
        <>
          {user ? (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-primary">{user.email}</p>
                <p className="text-sm text-on-surface-variant">Current balance: ₹{latestBalance}</p>
              </div>
              <a href={exportHref} className={buttonStyles("secondary")}>
                Export CSV
              </a>
            </Card>
          ) : (
            <div className="flex justify-end">
              <a href={exportHref} className={buttonStyles("secondary")}>
                Export CSV
              </a>
            </div>
          )}

          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
              <Icon name="receipt_long" className="text-[32px] text-on-surface-variant" />
              <p className="text-sm text-on-surface-variant">No ledger entries match the current filters.</p>
            </div>
          ) : (
            <div className="overflow-auto rounded-xl bg-surface-container-lowest shadow-sm">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-surface-container-high bg-surface-container-lowest text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    {!user && <th className="px-4 py-3">User</th>}
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {e.transactionTimestamp.toISOString().slice(0, 10)}
                      </td>
                      {!user && <td className="px-4 py-3 text-on-surface-variant">{e.user.email}</td>}
                      <td className="px-4 py-3 text-on-surface-variant">{e.transactionType}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{e.description}</td>
                      <td className="px-4 py-3 font-medium text-primary">₹{Number(e.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-on-surface-variant">₹{Number(e.balanceAfter).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-on-surface-variant">
              Page {page} of {totalPages} · {total} total entries
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <a href={pageHref(page - 1)} className={buttonStyles("secondary")}>
                  Previous
                </a>
              ) : null}
              {page < totalPages ? (
                <a href={pageHref(page + 1)} className={buttonStyles("secondary")}>
                  Next
                </a>
              ) : null}
            </div>
          </div>
        </>
      )}
    </>
  );
}
