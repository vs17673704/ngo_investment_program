import Link from "next/link";
import { Icon } from "@/components/Icon";

// Extracted from AdminShell so each admin page can supply its own title/back
// link without AdminShell needing a per-navigation prop (AdminShell now lives
// in src/app/admin/layout.tsx and is not re-rendered per page).
export function AdminPageHeader({
  title,
  backToAdmin = true,
}: {
  title: string;
  backToAdmin?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-primary">{title}</h1>
      {backToAdmin && (
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm font-medium text-on-surface-variant transition-colors hover:text-primary"
        >
          <Icon name="arrow_back" className="text-[18px]" />
          Back to admin
        </Link>
      )}
    </div>
  );
}
