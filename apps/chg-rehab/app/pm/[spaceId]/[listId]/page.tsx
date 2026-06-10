import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import PmLayout from "@/components/pm/PmLayout";
import PmListView from "@/components/pm/PmListView";

export const dynamic = "force-dynamic";

export default async function PmListPage({
  params,
}: {
  params: { spaceId: string; listId: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [spaces, space, list] = await Promise.all([
    prisma.pmSpace.findMany({
      where: { companyId: user.companyId },
      include: { lists: { orderBy: { order: "asc" } }, statuses: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pmSpace.findFirst({
      where: { id: params.spaceId, companyId: user.companyId },
      include: { statuses: { orderBy: { order: "asc" } }, lists: { orderBy: { order: "asc" } } },
    }),
    prisma.pmList.findFirst({
      where: { id: params.listId, space: { companyId: user.companyId } },
    }),
  ]);

  if (!space || !list) redirect("/pm");

  const tasks = await prisma.pmTask.findMany({
    where: { listId: params.listId, parentTaskId: null },
    include: {
      status: true,
      assignees: {
        include: { user: { select: { id: true, firstName: true, lastName: true, initials: true } } },
      },
      _count: { select: { subtasks: true } },
      tags: { include: { tag: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <PmLayout
      spaces={spaces}
      selectedSpaceId={params.spaceId}
      selectedListId={params.listId}
      statuses={space.statuses}
      lists={space.lists}
    >
      <PmListView
        tasks={tasks as any}
        statuses={space.statuses}
        listId={params.listId}
        spaceId={params.spaceId}
      />
    </PmLayout>
  );
}
