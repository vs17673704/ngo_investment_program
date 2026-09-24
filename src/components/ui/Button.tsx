import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "default" | "sm" | "icon";

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary shadow-sm transition-all hover:bg-primary-container disabled:opacity-50",
  secondary: "border border-surface-container-high text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50",
  ghost: "text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  default: "min-h-touch rounded-(--radius-button) px-4 text-sm font-medium",
  sm: "min-h-touch rounded-(--radius-button) px-2 text-xs font-medium",
  icon: "h-6 w-6 rounded",
};

// The "pressed"/active-pill look shared by primary buttons and the active
// state of nav links (ShellNavLink's activeClassName) — nav links already
// supply their own layout/shape classes, so this is just the color+shadow.
export const navActiveClassName = "bg-primary text-on-primary shadow-sm";

export function buttonStyles(variant: ButtonVariant = "primary", size: ButtonSize = "default", className?: string) {
  return cn("flex items-center justify-center gap-1.5", SIZE_STYLES[size], VARIANT_STYLES[variant], className);
}

export function Button({
  variant = "primary",
  size = "default",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonStyles(variant, size, className)} {...props} />;
}
