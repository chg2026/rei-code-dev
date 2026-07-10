import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import DailyLogClient, { type DailyLogRow } from "@/components/rehab/DailyLogClient";

export const dynamic = "force-dynamic";

export default async function DailyLogPage({
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

  const [logs, photos] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { projectId: project.id },
      orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.photo.findMany({
      where: { projectId: project.id, dailyLogId: { not: null } },
      select: { id: true, docId: true, caption: true, dailyLogId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const authorIds = Array.from(
    new Set(logs.map((l) => l.createdById).filter((id): id is string => !!id))
  );
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds }, companyId: user.companyId },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const authorName = new Map(
    authors.map((u) => [
      u.id,
      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "User",
    ])
  );

  const rows: DailyLogRow[] = logs.map((l) => ({
    id: l.id,
    logDate: l.logDate.toISOString().slice(0, 10),
    weather: l.weather,
    crewCount: l.crewCount,
    workPerformed: l.workPerformed,
    notes: l.notes,
    createdBy: l.createdById ? authorName.get(l.createdById) ?? null : null,
    photos: photos
      .filter((p) => p.dailyLogId === l.id)
      .map((p) => ({ id: p.id, docId: p.docId, caption: p.caption })),
  }));

  return (
    <div className="tab-panel active">
      <DailyLogClient projectCode={project.code} logs={rows} canEdit={canEdit} />
    </div>
  );
}
