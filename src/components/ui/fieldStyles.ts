import { cn } from "@/lib/ui/cn";

export function fieldClassName(className?: string) {
  return cn(
    "min-h-touch rounded-(--radius-input) border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none",
    className,
  );
}
