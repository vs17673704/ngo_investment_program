import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "error" | "info";
export type BadgeSize = "default" | "sm";

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  success: "bg-secondary-container/60 text-on-secondary-container",
  warning: "bg-tertiary-container text-on-tertiary-container",
  error: "bg-error-container text-on-error-container",
  info: "bg-primary-container text-on-primary-container",
};

const SIZE_STYLES: Record<BadgeSize, string> = {
  default: "px-3 py-1 text-xs font-semibold",
  sm: "px-2 py-0.5 text-xs font-medium",
};

export function Badge({
  tone = "neutral",
  size = "default",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone; size?: BadgeSize }) {
  return <span className={cn("rounded-full", SIZE_STYLES[size], TONE_STYLES[tone], className)} {...props} />;
}
