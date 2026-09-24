import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CreateGadgetForm } from "../Forms";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { GadgetsTable } from "./GadgetsTable";

export default async function AdminGadgetsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/dashboard");

  const gadgets = await prisma.gadgetItem.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <AdminPageHeader title="Gadgets" />
      <section className="flex flex-col gap-3">
        <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
          <CreateGadgetForm />
        </div>
        <GadgetsTable
          gadgets={gadgets.map((g) => ({
            id: g.id,
            category: g.category,
            name: g.name,
            price: Number(g.price).toFixed(2),
            stockQuantity: g.stockQuantity,
            reservedQuantity: g.reservedQuantity,
          }))}
        />
      </section>
    </>
  );
}
