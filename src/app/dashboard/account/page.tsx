import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import ChangePasswordForm from "./ChangePasswordForm";
import MobileNumberForm from "./MobileNumberForm";
import { updatePushNotificationsAction } from "./actions";
import { Icon } from "@/components/Icon";
import PushNotificationToggle from "@/components/PushNotificationToggle";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.sub } });

  return (
    <>
      <div className="flex w-full flex-col gap-5">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">Account</h1>
          <Link href="/dashboard" className="text-sm font-semibold text-primary hover:underline">
            Back to dashboard
          </Link>
        </div>

        <div className="rounded-xl bg-surface-container-lowest p-3 shadow-sm">
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-on-surface-variant">Email</dt>
              <dd className="font-medium text-on-surface">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant">Email verified</dt>
              <dd className="font-medium text-on-surface">
                {user.isEmailVerified ? (
                  <span className="inline-flex items-center gap-1 text-secondary">
                    <Icon name="check_circle" className="text-[16px]" /> Yes
                  </span>
                ) : (
                  <>
                    No —{" "}
                    <Link href="/dashboard/verify-email" className="text-primary hover:underline">
                      verify now
                    </Link>
                  </>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <section className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-3 shadow-sm">
          <h2 className="font-heading text-base font-semibold text-primary">Mobile number</h2>
          <MobileNumberForm currentValue={user.mobileNumber} />
        </section>

        <section className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-3 shadow-sm">
          <h2 className="font-heading text-base font-semibold text-primary">Change password</h2>
          {user.passwordHash ? (
            <ChangePasswordForm />
          ) : (
            <p className="text-xs text-on-surface-variant">
              This account signed in via Google and has no password set.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-3 shadow-sm">
          <h2 className="font-heading text-base font-semibold text-primary">Push Notifications</h2>
          <PushNotificationToggle
            currentValue={user.pushNotificationsEnabled}
            action={updatePushNotificationsAction}
          />
        </section>
      </div>
    </>
  );
}
