import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/Icon";

const TYPE_ICON: Record<string, string> = {
  PAYMENT: "receipt_long",
  REDEMPTION: "currency_exchange",
  REFERRAL: "group_add",
  SECURITY: "shield",
  SYSTEM: "info",
};

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  await prisma.notification.updateMany({
    where: { userId: session.sub, isRead: false },
    data: { isRead: true },
  });

  return (
    <>
      <div className="flex w-full flex-col gap-4">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Notifications</h1>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-lowest p-8 text-center shadow-sm">
            <Icon name="notifications_off" className="text-[32px] text-on-surface-variant" />
            <p className="text-sm text-on-surface-variant">You have no notifications yet.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`flex items-start gap-3 rounded-xl p-4 shadow-sm ${n.isRead ? "bg-surface-container-lowest" : "bg-surface-container-low"}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface">
                  <Icon name={TYPE_ICON[n.type] ?? "notifications"} className="text-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-primary">{n.title}</p>
                  <p className="text-sm text-on-surface-variant">{n.message}</p>
                  <p className="mt-1 text-xs text-outline">{n.createdAt.toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
