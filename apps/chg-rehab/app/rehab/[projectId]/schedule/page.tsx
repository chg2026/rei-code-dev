import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import { ChecklistStatus, PhaseStatus } from "@prisma/client";
import { parseProjectMeta } from "@/lib/rehab/types";
import ScheduleViewToggle from "@/components/rehab/ScheduleViewToggle";
import PhaseStatusSelect from "@/components/rehab/PhaseStatusSelect";
import GanttChart, { type GanttPhase } from "@/components/rehab/GanttChart";

export const dynamic = "force-dynamic";
const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "gantt";
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();

  const meta = parseProjectMeta(project.meta);

  // Effective scheduling dates: prefer the planned* fields (basis for the
  // Gantt) and fall back to the legacy start/end for phases not yet planned.
  const phaseStart = (p: (typeof project.phases)[number]) =>
    p.plannedStartDate ?? p.startDate ?? null;
  const phaseEnd = (p: (typeof project.phases)[number]) =>
    p.plannedEndDate ?? p.endDate ?? null;
  const phaseDays = (p: (typeof project.phases)[number]) => {
    if (p.estimatedDays && p.estimatedDays > 0) return p.estimatedDays;
    const s = phaseStart(p);
    const e = phaseEnd(p);
    return s && e ? Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000)) : 0;
  };
  const start = project.startDate ?? new Date(project.createdAt);
  const end = project.endDate ?? new Date();
  const totalMs = Math.max(1, end.getTime() - start.getTime());
  const totalDays = Math.round(totalMs / 86_400_000) + 1;
  const elapsed = Math.max(0, Math.min(totalDays, Math.round((Date.now() - start.getTime()) / 86_400_000)));
  const remaining = Math.max(0, totalDays - elapsed);
  const active = project.phases.find((p) => p.status === PhaseStatus.InProgress);

  // Serialized phase data for the interactive (client) Gantt. Dependency-aware
  // scheduling, critical path, arrows, progress fill and zoom are computed there.
  const ganttPhases: GanttPhase[] = project.phases.map((p) => {
    const s = phaseStart(p);
    const e = phaseEnd(p);
    const done = p.checklistItems.filter(
      (i) => i.status === ChecklistStatus.Done || i.status === ChecklistStatus.NA
    ).length;
    return {
      id: p.id,
      number: p.number,
      name: p.name,
      status: p.status,
      plannedStartMs: s ? s.getTime() : null,
      plannedEndMs: e ? e.getTime() : null,
      estimatedDays: p.estimatedDays ?? 0,
      dependencies: p.dependencies ?? [],
      checklistDone: done,
      checklistTotal: p.checklistItems.length,
    };
  });

  return (
    <div className="tab-panel active">
      <div className="action-bar">
        <ScheduleViewToggle projectCode={project.code} view={view} />
        <button className="btn">+ Add addendum</button>
        <button className="btn">Export</button>
      </div>

      <div className="sched-layout" style={{ flex: 1, overflow: "hidden" }}>
        <div className="info-panel">
          <div className="ip-sec">
            <div className="ip-lbl">Current phase</div>
            <div className="ip-val">{active?.name ?? "—"}</div>
            <div className="ip-sub">
              {active ? `Job Type ${active.number} of ${project.phases.length} · In progress` : "—"}
            </div>
          </div>
          <div className="ip-sec">
            <div className="ip-lbl">Timeline</div>
            <div className="ip-row"><span className="ir-lbl">Start</span><span className="ir-val">{formatET(start, false)}</span></div>
            {meta.originalEndDate && (
              <div className="ip-row">
                <span className="ir-lbl">Original end</span>
                <span className="ir-val" style={{ textDecoration: "line-through", color: "var(--text-tertiary)" }}>
                  {formatET(new Date(meta.originalEndDate), false)}
                </span>
              </div>
            )}
            <div className="ip-row"><span className="ir-lbl">Revised end</span><span className="ir-val">{formatET(end, false)} ET</span></div>
            <div className="ip-row"><span className="ir-lbl">Days elapsed</span><span className="ir-val">{elapsed} of {totalDays}</span></div>
            <div className="ip-row"><span className="ir-lbl">Remaining</span><span className="ir-val">{remaining} days</span></div>
          </div>
          <div className="ip-sec">
            <div className="ip-lbl">Penalty tracker</div>
            <div className="ip-row"><span className="ir-lbl">Per diem</span><span className="ir-val">${Number(meta.penaltyPerDiem ?? 0)} / day</span></div>
            <div className="ip-row"><span className="ir-lbl">Accrued</span><span className="ir-val" style={{ color: "var(--green)" }}>${Number(meta.penaltyAccrued ?? 0).toFixed(2)}</span></div>
            <div className="ip-row">
              <span className="ir-lbl">Status</span>
              <span className="small-badge" style={meta.penaltyStatus === "Paused" ? { background: "var(--green-bg)", color: "var(--green-txt)" } : { background: "var(--amber-bg)", color: "var(--amber-txt)" }}>
                {meta.penaltyStatus ?? "Active"}
              </span>
            </div>
            <div className="ip-row"><span className="ir-lbl">Anchored to</span><span className="ir-val">{formatET(end, false)} ET</span></div>
          </div>
          <div className="ip-sec" style={{ borderBottom: "none" }}>
            <div className="ip-lbl">Addenda</div>
            {project.addenda.map((a) => (
              <div className="ip-row" key={a.id}>
                <span className="ir-lbl" style={{ color: "var(--blue)" }}>{a.title}</span>
                <span className="small-badge" style={{ background: "var(--purple-bg)", color: "var(--purple-txt)" }}>
                  {a.daysDelta === 0 ? "+0 days" : `+${a.daysDelta} day${a.daysDelta === 1 ? "" : "s"}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {view === "list" ? (
          <div className="gantt-panel" style={{ overflow: "auto" }}>
            <div className="data-hd" style={{ gridTemplateColumns: "32px minmax(0,1fr) 110px 110px 60px 110px 90px" }}>
              <span className="col-label">#</span>
              <span className="col-label">Job Type</span>
              <span className="col-label">Start (ET)</span>
              <span className="col-label">End (ET)</span>
              <span className="col-label" style={{ textAlign: "right" }}>Days</span>
              <span className="col-label">Status</span>
              <span className="col-label" style={{ textAlign: "right" }}>Budget</span>
            </div>
            {project.phases.map((p) => {
              const ps = phaseStart(p);
              const pe = phaseEnd(p);
              const days = phaseDays(p);
              const done = p.checklistItems.filter(
                (i) => i.status === ChecklistStatus.Done || i.status === ChecklistStatus.NA
              ).length;
              const totalItems = p.checklistItems.length;
              const incompleteChecklist = totalItems > 0 && done < totalItems;
              return (
                <div
                  className="data-row"
                  style={{ gridTemplateColumns: "32px minmax(0,1fr) 110px 110px 60px 110px 90px" }}
                  key={p.id}
                >
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{p.number}</div>
                  <div>
                    <div className="cell-name">{p.name}</div>
                    <div className="cell-meta">
                      Checklist {done}/{totalItems}
                      {p.drawNote ? ` · ${p.drawNote}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 11 }}>{formatET(ps, false)}</div>
                  <div style={{ fontSize: 11 }}>{formatET(pe, false)}</div>
                  <div style={{ fontSize: 11, textAlign: "right" }}>{days}</div>
                  <div>
                    <PhaseStatusSelect
                      phaseId={p.id}
                      projectId={project.code}
                      currentStatus={p.status}
                      incompleteChecklist={incompleteChecklist}
                    />
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, fontWeight: 500 }}>{fmt$(Number(p.budget ?? 0))}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <GanttChart phases={ganttPhases} projectId={project.code} />
        )}
      </div>
    </div>
  );
}
