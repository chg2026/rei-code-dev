import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatET } from "@/lib/datetime";
import PhotoAttachButton from "@/components/rehab/PhotoAttachButton";

export const dynamic = "force-dynamic";

export default async function PhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const sp = await searchParams;
  const project = await prisma.project.findUnique({
    where: { companyId_code: { companyId: user.companyId, code: decodeURIComponent(projectId) } },
    select: { id: true, code: true },
  });
  if (!project) notFound();
  const canEdit = await can(user, "documents", "edit");

  const [photos, phases] = await Promise.all([
    prisma.photo.findMany({
      where: { projectId: project.id },
      include: { document: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.phase.findMany({
      where: { projectId: project.id },
      select: { id: true, number: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { number: "asc" }],
    }),
  ]);

  // Labels for the record each photo is attached to (daily log / issue / punch).
  const logIds = photos.map((p) => p.dailyLogId).filter((v): v is string => !!v);
  const issueIds = photos.map((p) => p.issueId).filter((v): v is string => !!v);
  const punchIds = photos.map((p) => p.punchItemId).filter((v): v is string => !!v);
  const [logs, issues, punchItems] = await Promise.all([
    logIds.length
      ? prisma.dailyLog.findMany({ where: { id: { in: logIds } }, select: { id: true, logDate: true } })
      : Promise.resolve([]),
    issueIds.length
      ? prisma.issue.findMany({ where: { id: { in: issueIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    punchIds.length
      ? prisma.punchItem.findMany({ where: { id: { in: punchIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
  ]);
  const logDateById = new Map(logs.map((l) => [l.id, l.logDate.toISOString().slice(0, 10)]));
  const issueTitleById = new Map(issues.map((i) => [i.id, i.title]));
  const punchTitleById = new Map(punchItems.map((i) => [i.id, i.title]));
  const phaseById = new Map(phases.map((p) => [p.id, p]));

  const phaseFilter = sp.phase ? parseInt(sp.phase, 10) : null;
  const filterPhase = phaseFilter != null && !Number.isNaN(phaseFilter)
    ? phases.find((p) => p.number === phaseFilter) ?? null
    : null;
  const visible = filterPhase ? photos.filter((p) => p.phaseId === filterPhase.id) : photos;

  const base = `/rehab/${encodeURIComponent(project.code)}/photos`;
  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "2px 9px",
    borderRadius: 999,
    fontSize: 10,
    border: "0.5px solid var(--border-mid)",
    textDecoration: "none",
    background: active ? "var(--marine, var(--blue))" : "transparent",
    color: active ? "#fff" : "var(--text-secondary)",
  });

  return (
    <div className="tab-panel active">
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div className="proj-bar" style={{ borderTop: "0.5px solid var(--border-lo)", position: "relative" }}>
          <div className="proj-l" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="proj-addr" style={{ fontSize: 11, marginRight: 6 }}>
              {visible.length} photo{visible.length === 1 ? "" : "s"}
            </span>
            <Link href={base} style={chipStyle(!filterPhase)}>All</Link>
            {phases.map((p) => (
              <Link key={p.id} href={`${base}?phase=${p.number}`} style={chipStyle(filterPhase?.id === p.id)}>
                {p.number} · {p.name}
              </Link>
            ))}
          </div>
          <div className="proj-r">
            {canEdit && (
              <PhotoAttachButton
                projectCode={project.code}
                phaseOptions={phases}
                label="+ Add photo"
                className="btn btn-primary"
              />
            )}
          </div>
        </div>

        {visible.length === 0 && (
          <div style={{ padding: "18px 14px", fontSize: 11, color: "var(--text-tertiary)" }}>
            {photos.length === 0
              ? "No photos yet. Attach photos here, or from a daily log, issue, or punch item."
              : "No photos for this job type."}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
            padding: 14,
          }}
        >
          {visible.map((photo) => {
            const phase = photo.phaseId ? phaseById.get(photo.phaseId) : null;
            const source = photo.dailyLogId
              ? `Daily log · ${logDateById.get(photo.dailyLogId) ?? ""}`
              : photo.issueId
              ? `Issue · ${issueTitleById.get(photo.issueId) ?? ""}`
              : photo.punchItemId
              ? `Punch · ${punchTitleById.get(photo.punchItemId) ?? ""}`
              : null;
            return (
              <div
                key={photo.id}
                style={{ border: "0.5px solid var(--border-lo)", borderRadius: 6, overflow: "hidden", background: "var(--bg-secondary)" }}
              >
                {photo.docId ? (
                  <a href={`/api/documents/${photo.docId}/download`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/documents/${photo.docId}/download`}
                      alt={photo.caption ?? photo.document?.name ?? "Photo"}
                      style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                    />
                  </a>
                ) : (
                  <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--text-tertiary)" }}>
                    File removed
                  </div>
                )}
                <div style={{ padding: "6px 8px" }}>
                  <div style={{ fontSize: 10, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {photo.caption ?? photo.document?.name ?? "Photo"}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {phase ? `Job Type ${phase.number}` : "No job type"}
                    {source ? ` · ${source}` : ""}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {formatET(photo.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
