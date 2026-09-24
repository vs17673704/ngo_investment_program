import type { ComponentProps, ElementType } from "react";
import { cn } from "@/lib/ui/cn";

const BASE = "rounded-(--radius-card) bg-surface-container-lowest p-4 shadow-sm";

type CardProps<T extends ElementType> = { as?: T; className?: string } & Omit<ComponentProps<T>, "as" | "className">;

export function Card<T extends ElementType = "div">({ as, className, ...props }: CardProps<T>) {
  const Component = as ?? "div";
  return <Component className={cn(BASE, className)} {...props} />;
}
