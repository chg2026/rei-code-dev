import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatET } from "@/lib/datetime";
import IssuesBoardClient, {
  type IssueRow,
  type PhaseOption,
  type TeamOption,
} from "@/components/rehab/IssuesBoardClient";

export const dynamic = "force-dynamic";

export default async function IssuesPage({
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

  const [issues, photos, phases, assignments] = await Promise.all([
    prisma.issue.findMany({
      where: { projectId: project.id },
      include: { phase: { select: { id: true, number: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.photo.findMany({
      where: { projectId: project.id, issueId: { not: null } },
      select: { id: true, docId: true, caption: true, issueId: true },
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

  const userIds = new Set<string>();
  for (const i of issues) {
    if (i.assigneeId) userIds.add(i.assigneeId);
    if (i.createdById) userIds.add(i.createdById);
  }
  const extraUsers = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(userIds) }, companyId: user.companyId },
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

  const rows: IssueRow[] = issues.map((i) => ({
    id: i.id,
    type: i.type,
    title: i.title,
    description: i.description,
    status: i.status,
    phaseId: i.phaseId,
    phaseLabel: i.phase ? `Job Type ${i.phase.number} — ${i.phase.name}` : null,
    assigneeId: i.assigneeId,
    assignee: i.assigneeId ? nameById.get(i.assigneeId) ?? null : null,
    createdBy: i.createdById ? nameById.get(i.createdById) ?? null : null,
    createdAtLabel: formatET(i.createdAt),
    resolvedAtLabel: i.resolvedAt ? formatET(i.resolvedAt) : null,
    photos: photos
      .filter((p) => p.issueId === i.id)
      .map((p) => ({ id: p.id, docId: p.docId, caption: p.caption })),
  }));

  const phaseOptions: PhaseOption[] = phases;

  return (
    <div className="tab-panel active">
      <IssuesBoardClient
        projectCode={project.code}
        issues={rows}
        phases={phaseOptions}
        team={team}
        canEdit={canEdit}
      />
    </div>
  );
}
