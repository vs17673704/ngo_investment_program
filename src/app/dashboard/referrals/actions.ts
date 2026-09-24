"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/referral-code";
import { logAudit } from "@/lib/audit";

export type RegenerateCodeState = { error?: string; message?: string } | undefined;

// BRD Rule XII: a user may regenerate/rotate their referral code. The previous
// code becomes inactive for new registrations (registration matches against
// the current User.referralCode value, so once overwritten the old string no
// longer resolves to any user) while existing Referral relationships remain
// keyed to referrerUserId, not to the code string — so they are unaffected.
export async function regenerateReferralCodeAction(
  _prev: RegenerateCodeState,
  _formData: FormData,
): Promise<RegenerateCodeState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const previousCode = (await prisma.user.findUniqueOrThrow({ where: { id: session.sub } })).referralCode;
  const newCode = await generateUniqueReferralCode();

  await prisma.user.update({
    where: { id: session.sub },
    data: { referralCode: newCode, referralCodeActive: true },
  });

  await logAudit({
    actorUserId: session.sub,
    eventType: "REFERRAL_CODE_REGENERATED",
    entityRef: session.sub,
    details: { previousCode, newCode },
  });

  revalidatePath("/dashboard/referrals");
  return { message: `New referral code generated: ${newCode}` };
}
