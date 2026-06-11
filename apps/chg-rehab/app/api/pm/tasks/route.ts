import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tasks = await prisma.pmTask.findMany({
    where: {
      companyId: user.companyId,
      parentTaskId: null,
      OR: [
        { createdById: user.id },
        { assignees: { some: { userId: user.id } } },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: {
      status: { select: { id: true, name: true, color: true, type: true } },
      assignees: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, initials: true, email: true } },
        },
      },
      list: { select: { id: true, name: true, space: { select: { id: true, name: true } } } },
    },
  });

  const mapped = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    priority: t.priority,
    dueDate: t.dueDate?.toISOString() ?? null,
    done: !!t.doneDate,
    status: t.status,
    listName: t.list.name,
    spaceName: t.list.space.name,
    listHref: `/pm/${t.list.space.id}/${t.list.id}`,
    assignees: t.assignees.map((a) => ({
      id: a.user.id,
      name: [a.user.firstName, a.user.lastName].filter(Boolean).join(" ") || a.user.email || "User",
      initials: (a.user.initials || [(a.user.firstName ?? "")[0], (a.user.lastName ?? "")[0]].filter(Boolean).join("") || "?").toUpperCase(),
    })),
  }));

  return NextResponse.json({ tasks: mapped });
}
