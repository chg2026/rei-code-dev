import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import PmLayout from "@/components/pm/PmLayout";

export const dynamic = "force-dynamic";

export default async function PmListPage({
  params,
}: {
  params: Promise<{ spaceId: string; listId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { spaceId, listId } = await params;

  const [spacesRaw, space, list] = await Promise.all([
    prisma.pmSpace.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        lists: {
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, color: true, order: true },
        },
        _count: { select: { lists: true } },
      },
    }),
    prisma.pmSpace.findFirst({
      where: { id: spaceId, companyId: user.companyId },
      include: {
        lists: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        statuses: { orderBy: { order: "asc" } },
      },
    }),
    prisma.pmList.findFirst({ where: { id: listId, spaceId, companyId: user.companyId } }),
  ]);

  if (!space || !list) redirect("/pm");

  const tasksRaw = await prisma.pmTask.findMany({
    where: { listId, companyId: user.companyId, parentTaskId: null },
    orderBy: { createdAt: "asc" },
    include: {
      status: { select: { id: true, name: true, color: true, type: true } },
      assignees: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } },
        },
      },
      tags: { include: { tag: true } },
      _count: { select: { subtasks: true } },
    },
  });

  const tasks = tasksRaw.map((t) => ({
    id: t.id,
    name: t.name,
    taskType: t.taskType,
    priority: t.priority,
    statusId: t.statusId,
    status: t.status,
    parentTaskId: t.parentTaskId,
    startDate: t.startDate?.toISOString() ?? null,
    dueDate: t.dueDate?.toISOString() ?? null,
    doneDate: t.doneDate?.toISOString() ?? null,
    subtaskCount: t._count.subtasks,
    assignees: t.assignees.map((a) => ({
      id: a.user.id,
      name: [a.user.firstName, a.user.lastName].filter(Boolean).join(" ") || a.user.email || "User",
      initials: (a.user.initials ||
        [(a.user.firstName ?? "")[0], (a.user.lastName ?? "")[0]].filter(Boolean).join("") ||
        "?").toUpperCase(),
    })),
    tags: t.tags.map((x) => x.tag),
  }));

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
      selectedListId={listId}
      tasks={tasks}
      statuses={statuses}
      lists={space.lists.map((l) => ({ id: l.id, name: l.name, color: l.color, order: l.order }))}
    />
  );
}
