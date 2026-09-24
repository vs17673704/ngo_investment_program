import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CreateCollegeForm } from "../Forms";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { CollegesList } from "./CollegesList";

export default async function AdminCollegesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const colleges = await prisma.college.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <AdminPageHeader title="Colleges" />
      <section className="flex flex-col gap-3">
        <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
          <CreateCollegeForm />
        </div>
        <CollegesList colleges={colleges.map((c) => ({ id: c.id, name: c.name }))} />
      </section>
    </>
  );
}
