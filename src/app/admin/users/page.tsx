import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { UsersTable } from "./UsersTable";
import { AdminPageHeader } from "@/components/AdminPageHeader";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <AdminPageHeader title="User Management" />

      <UsersTable
        users={users.map((u) => {
          const locked = !!u.lockedUntil && u.lockedUntil > new Date();
          return {
            id: u.id,
            email: u.email,
            mobileNumber: u.mobileNumber,
            role: u.role,
            referralCode: u.referralCode,
            referralCodeActive: u.referralCodeActive,
            rewardPointsBalance: u.rewardPointsBalance,
            locked,
            joinedAt: u.createdAt.toLocaleDateString(),
          };
        })}
      />
    </>
  );
}
