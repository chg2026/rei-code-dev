import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import PmLayout from "@/components/pm/PmLayout";

export const dynamic = "force-dynamic";

export default async function PmPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const spacesRaw = await prisma.pmSpace.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      lists: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, color: true, order: true },
      },
      _count: { select: { lists: true } },
    },
  });

  const spaces = spacesRaw.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    icon: s.icon,
    order: s.order,
    lists: s.lists,
    _count: s._count,
  }));

  return <PmLayout spaces={spaces} />;
}
