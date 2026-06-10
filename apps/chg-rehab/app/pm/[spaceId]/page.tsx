import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import PmLayout from "@/components/pm/PmLayout";

export const dynamic = "force-dynamic";

export default async function PmSpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { spaceId } = await params;

  const space = await prisma.pmSpace.findFirst({
    where: { id: spaceId, companyId: user.companyId },
    include: {
      lists: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      statuses: { orderBy: { order: "asc" } },
    },
  });
  if (!space) redirect("/pm");

  // Jump straight to the first list when the space has any.
  if (space.lists.length > 0) redirect(`/pm/${spaceId}/${space.lists[0].id}`);

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

  const statuses = space.statuses.map((st) => ({
    id: st.id,
    name: st.name,
    color: st.color,
    type: st.type,
    order: st.order,
    isDefault: st.isDefault,
  }));

  return (
    <PmLayout
      spaces={spaces}
      selectedSpaceId={spaceId}
      statuses={statuses}
      lists={space.lists.map((l) => ({ id: l.id, name: l.name, color: l.color, order: l.order }))}
    />
  );
}
