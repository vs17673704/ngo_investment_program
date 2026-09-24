import { EventEmitter } from "events";

/**
 * In-process pub/sub for pushing live events to connected Admin SSE clients
 * (see src/app/api/admin/events/route.ts). This app runs as a single Node
 * process — if it's ever deployed across multiple instances, this needs to
 * be replaced with a shared broker (e.g. Redis pub/sub), since each instance
 * would otherwise only see events emitted on itself.
 */

export type AdminEventType =
  | "redemption.requested"
  | "redemption.cancelled"
  | "redemption.modified"
  | "franchisee.enquiry.submitted"
  | "general_enquiry.submitted"
  | "manual_payment.submitted"
  | "webhook.signature_invalid"
  | "token.reuse_detected"
  | "login.failed"
  | "autopay.batch_run"
  | "payment_retry.batch_run"
  | "maturity.batch_run"
  | "instalment_reminder.batch_run"
  | "redemptions_expired.batch_run";

export type AdminEvent = {
  type: AdminEventType;
  message: string;
  details?: Record<string, unknown>;
};

const CHANNEL = "admin-event";

// Next.js compiles Route Handlers and Server Actions into separate bundles,
// each of which would otherwise get its own instantiation of a plain
// module-level `new EventEmitter()` — so events emitted from a Server Action
// would never reach a listener subscribed from the SSE route. Pinning the
// singleton to `globalThis` (the same pattern this project already uses for
// its Prisma client in src/lib/prisma.ts) guarantees every bundle shares the
// exact same EventEmitter instance within this one Node process.
const globalForAdminEvents = globalThis as unknown as { __adminEventBus?: EventEmitter };

const bus = globalForAdminEvents.__adminEventBus ?? new EventEmitter();
// Several admin browser tabs may each hold one open SSE connection.
bus.setMaxListeners(50);
globalForAdminEvents.__adminEventBus = bus;

export function emitAdminEvent(event: AdminEvent) {
  bus.emit(CHANNEL, event);
}

export function subscribeAdminEvents(listener: (event: AdminEvent) => void): () => void {
  bus.on(CHANNEL, listener);
  return () => bus.off(CHANNEL, listener);
}
