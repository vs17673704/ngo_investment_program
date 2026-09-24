import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDashboardShellData } from "@/lib/dashboard";
import { DashboardShell } from "@/components/DashboardShell";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await getSession();
  if (!session) redirect("/");

  const { email, referralCode, unreadNotificationCount } = await getDashboardShellData(session.sub);

  return (
    <DashboardShell email={email} referralCode={referralCode} unreadNotificationCount={unreadNotificationCount}>
      {children}
    </DashboardShell>
  );
}
