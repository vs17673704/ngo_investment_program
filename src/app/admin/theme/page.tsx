import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { getOrCreateDraft, getPublishedThemeRow, getArchivedThemeRows } from "@/lib/theme";
import ThemeEditor from "./ThemeEditor";

export default async function AdminThemePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [draft, published, archived] = await Promise.all([
    getOrCreateDraft(session.sub),
    getPublishedThemeRow(),
    getArchivedThemeRows(),
  ]);

  return (
    <>
      <AdminPageHeader title="Website Appearance" />
      <ThemeEditor
        draft={JSON.parse(JSON.stringify(draft))}
        published={published ? JSON.parse(JSON.stringify(published)) : null}
        history={JSON.parse(JSON.stringify(archived))}
      />
    </>
  );
}
