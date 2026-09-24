import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

// Master Prompt.md §27/§28: registration is tied to the authenticated
// session — the client-supplied payload never carries a user/admin id, and
// this endpoint is open to any authenticated account (User or Admin), since
// §33's FCM event mapping pushes to regular Users as well as Admins.

const subscribeSchema = z.object({
  fcmToken: z.string().min(1),
  platform: z.string().max(100).optional(),
});

const unsubscribeSchema = z.object({
  fcmToken: z.string().min(1),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { pushNotificationsEnabled: true },
  });

  return NextResponse.json({ enabled: user?.pushNotificationsEnabled ?? true });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
  }

  // BRD Rule XLII: an opted-out account must not accumulate new push
  // registrations while disabled.
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { pushNotificationsEnabled: true },
  });
  if (!user?.pushNotificationsEnabled) {
    return NextResponse.json({ ok: false, disabled: true });
  }

  const { fcmToken, platform } = parsed.data;
  const userAgent = request.headers.get("user-agent") ?? undefined;

  await prisma.pushSubscription.upsert({
    where: { fcmToken },
    create: { fcmToken, platform, userAgent, userId: session.sub },
    // §28 account isolation: a token that was previously registered under a
    // different account (e.g. account switch on a shared browser) is
    // reassigned to whoever is authenticated now, never left pointing at
    // the old account.
    update: { userId: session.sub, platform, userAgent, revokedAt: null, lastError: null },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await prisma.pushSubscription.updateMany({
    where: { fcmToken: parsed.data.fcmToken, userId: session.sub },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
