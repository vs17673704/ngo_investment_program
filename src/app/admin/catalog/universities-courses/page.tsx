import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CreateUniversityForm, CreateCourseForm } from "../Forms";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { UniversitiesList } from "./UniversitiesList";

export default async function AdminUniversitiesCoursesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const universities = await prisma.university.findMany({
    include: { courses: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <AdminPageHeader title="Universities & Courses" />
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
          <CreateUniversityForm />
          <CreateCourseForm universities={universities.map((u) => ({ id: u.id, name: u.name }))} />
        </div>
        <UniversitiesList
          universities={universities.map((u) => ({
            id: u.id,
            name: u.name,
            courses: u.courses.map((c) => ({ id: c.id, name: c.name, fee: Number(c.fee).toFixed(2) })),
          }))}
        />
      </section>
    </>
  );
}
