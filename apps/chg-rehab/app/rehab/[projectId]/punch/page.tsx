import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatET } from "@/lib/datetime";
import PunchListClient, {
  type PunchRow,
  type PhaseOption,
  type TeamOption,
} from "@/components/rehab/PunchListClient";

export const dynamic = "force-dynamic";

export default async function PunchListPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: decodeURIComponent(projectId) } },
    select: { id: true, code: true },
  });
  if (!project) notFound();
  const canEdit = await can(user, "rehab", "edit");

  const [items, photos, phases, assignments] = await Promise.all([
    prisma.punchItem.findMany({
      where: { projectId: project.id },
      include: { phase: { select: { id: true, number: true, name: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.photo.findMany({
      where: { projectId: project.id, punchItemId: { not: null } },
      select: { id: true, docId: true, caption: true, punchItemId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.phase.findMany({
      where: { projectId: project.id },
      select: { id: true, number: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
    }),
    prisma.projectAssignment.findMany({
      where: { projectId: project.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    }),
  ]);

  const assigneeIds = Array.from(
    new Set(items.map((i) => i.assigneeId).filter((id): id is string => !!id))
  );
  const extraUsers = assigneeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: assigneeIds }, companyId: user.companyId },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const name = (u: { firstName: string | null; lastName: string | null; email: string | null }) =>
    `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "User";
  const nameById = new Map<string, string>();
  for (const u of extraUsers) nameById.set(u.id, name(u));
  for (const a of assignments) nameById.set(a.user.id, name(a.user));

  const team: TeamOption[] = Array.from(
    new Map(assignments.map((a) => [a.user.id, { id: a.user.id, name: name(a.user) }])).values()
  );

  const rows: PunchRow[] = items.map((i) => ({
    id: i.id,
    title: i.title,
    location: i.location,
    status: i.status,
    phaseId: i.phaseId,
    phaseLabel: i.phase ? `Job Type ${i.phase.number} — ${i.phase.name}` : null,
    assignee: i.assigneeId ? nameById.get(i.assigneeId) ?? null : null,
    doneAtLabel: i.doneAt ? formatET(i.doneAt) : null,
    photos: photos
      .filter((p) => p.punchItemId === i.id)
      .map((p) => ({ id: p.id, docId: p.docId, caption: p.caption })),
  }));

  const phaseOptions: PhaseOption[] = phases;

  return (
    <div className="tab-panel active">
      <PunchListClient
        projectCode={project.code}
        items={rows}
        phases={phaseOptions}
        team={team}
        canEdit={canEdit}
      />
    </div>
  );
}
