"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { AdminEvent, AdminEventType } from "@/lib/events/admin-events";

type Toast = AdminEvent & { id: string };

type Severity = "info" | "warning" | "neutral";

const SEVERITY_BY_PREFIX: { test: (type: AdminEventType) => boolean; severity: Severity }[] = [
  { test: (t) => t.startsWith("webhook.") || t.startsWith("token.") || t === "login.failed", severity: "warning" },
  { test: (t) => t.endsWith(".batch_run"), severity: "neutral" },
  { test: () => true, severity: "info" },
];

function severityFor(type: AdminEventType): Severity {
  return SEVERITY_BY_PREFIX.find((rule) => rule.test(type))!.severity;
}

const SEVERITY_CLASSES: Record<Severity, string> = {
  info: "border-primary-container bg-primary-container/40 text-primary",
  warning: "border-error-container bg-error-container/60 text-error",
  neutral: "border-surface-container-high bg-surface-container-high text-on-surface-variant",
};

const SEVERITY_ICON: Record<Severity, string> = {
  info: "inventory_2",
  warning: "warning",
  neutral: "sync",
};

const TOAST_LIFETIME_MS = 6_000;
const RECONNECT_DELAY_MS = 3_000;

export function AdminLiveEvents() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idCounter = useRef(0);

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      source = new EventSource("/api/admin/events");

      source.onmessage = (message) => {
        let event: AdminEvent;
        try {
          event = JSON.parse(message.data);
        } catch {
          return;
        }

        idCounter.current += 1;
        const toast: Toast = { ...event, id: `${Date.now()}-${idCounter.current}` };
        setToasts((prev) => [...prev, toast]);
        router.refresh();

        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, TOAST_LIFETIME_MS);
      };

      source.onerror = () => {
        source?.close();
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      source?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [router]);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const severity = severityFor(toast.type);
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 shadow-lg ${SEVERITY_CLASSES[severity]}`}
          >
            <Icon name={SEVERITY_ICON[severity]} className="mt-0.5 text-[18px] shrink-0" />
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-current opacity-70 hover:opacity-100"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
