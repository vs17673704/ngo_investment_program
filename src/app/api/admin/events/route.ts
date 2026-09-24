import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { subscribeAdminEvents, type AdminEvent } from "@/lib/events/admin-events";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: AdminEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      // Flush an initial comment immediately: EventSource's "open" event
      // (and some intermediaries) wait for the first bytes of the body
      // before treating the connection as live, and otherwise nothing
      // would be sent until the first real event or the 25s heartbeat.
      controller.enqueue(encoder.encode(`: connected\n\n`));
      unsubscribe = subscribeAdminEvents(send);
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, HEARTBEAT_MS);
    },
    cancel() {
      unsubscribe?.();
      clearInterval(heartbeat);
    },
  });

  request.signal.addEventListener("abort", () => {
    unsubscribe?.();
    clearInterval(heartbeat);
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
