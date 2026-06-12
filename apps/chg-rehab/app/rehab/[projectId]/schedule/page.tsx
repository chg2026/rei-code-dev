import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import { ChecklistStatus, PhaseStatus } from "@prisma/client";
import { parseProjectMeta } from "@/lib/rehab/types";
import ScheduleViewToggle from "@/components/rehab/ScheduleViewToggle";

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
  const progressPct = (status: PhaseStatus) =>
    status === PhaseStatus.Complete ? 100 : status === PhaseStatus.Active ? 50 : 0;

  const start = project.startDate ?? new Date(project.createdAt);
  const end = project.endDate ?? new Date();
  const totalMs = Math.max(1, end.getTime() - start.getTime());
  const totalDays = Math.round(totalMs / 86_400_000) + 1;
  const elapsed = Math.max(0, Math.min(totalDays, Math.round((Date.now() - start.getTime()) / 86_400_000)));
  const remaining = Math.max(0, totalDays - elapsed);
  const active = project.phases.find((p) => p.status === PhaseStatus.Active);

  // Gantt chart range spans all planned phase dates, falling back to the
  // project window when phases have no scheduling data yet.
  const pStarts = project.phases.map(phaseStart).filter((d): d is Date => d !== null);
  const pEnds = project.phases.map(phaseEnd).filter((d): d is Date => d !== null);
  const chartStart = pStarts.length
    ? new Date(Math.min(...pStarts.map((d) => d.getTime())))
    : start;
  const chartEnd = pEnds.length
    ? new Date(Math.max(...pEnds.map((d) => d.getTime())))
    : end;
  const chartMs = Math.max(1, chartEnd.getTime() - chartStart.getTime());

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
              {active ? `Phase ${active.number} of ${project.phases.length} · In progress` : "—"}
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
              <span className="col-label">Phase</span>
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
              const stCls =
                p.status === PhaseStatus.Complete ? "st-done" : p.status === PhaseStatus.Active ? "st-act" : "st-wait";
              const stLabel =
                p.status === PhaseStatus.Complete ? "Complete" : p.status === PhaseStatus.Active ? "In progress" : "Pending";
              const done = p.checklistItems.filter(
                (i) => i.status === ChecklistStatus.Done || i.status === ChecklistStatus.NA
              ).length;
              const totalItems = p.checklistItems.length;
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
                  <span className={`st-badge ${stCls}`} style={{ fontSize: 9 }}>{stLabel}</span>
                  <div style={{ textAlign: "right", fontSize: 11, fontWeight: 500 }}>{fmt$(Number(p.budget ?? 0))}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="gantt-panel">
            <div className="g-months">
              <div className="gm">{formatET(chartStart, false).split(",")[0]} {chartStart.getFullYear()}</div>
              <div className="gm">{formatET(new Date(chartStart.getTime() + chartMs / 2), false).split(",")[0]}</div>
              <div className="gm">{formatET(chartEnd, false).split(",")[0]} {chartEnd.getFullYear()}</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {project.phases.map((p) => {
                const sd = phaseStart(p);
                const ed = phaseEnd(p);
                const ps = sd?.getTime() ?? chartStart.getTime();
                const pe = ed?.getTime() ?? ps;
                const left = Math.max(0, Math.min(100, ((ps - chartStart.getTime()) / chartMs) * 100));
                const width = Math.max(1, Math.min(100 - left, ((pe - ps) / chartMs) * 100));
                const progress = progressPct(p.status);
                const barCls =
                  p.status === PhaseStatus.Complete ? "gb-done" : p.status === PhaseStatus.Active ? "gb-act" : "gb-pend";
                const stCls =
                  p.status === PhaseStatus.Complete ? "st-done" : p.status === PhaseStatus.Active ? "st-act" : "st-wait";
                const stLabel =
                  p.status === PhaseStatus.Complete ? "Complete" : p.status === PhaseStatus.Active ? "In progress" : "Pending";
                return (
                  <div key={p.id} className={`g-row ${p.status === PhaseStatus.Active ? "cur" : ""}`}>
                    <div className="g-ph">
                      <div className="g-ph-name">{p.name}</div>
                      <div className="g-ph-sub">{formatET(sd, false)} – {formatET(ed, false)}</div>
                    </div>
                    <div className="g-track">
                      <div
                        className={`gbar ${barCls}`}
                        title={`${p.name} · ${formatET(sd, false)} – ${formatET(ed, false)} · ${progress}%`}
                        style={{ left: `${left}%`, width: `${width}%`, position: "relative", overflow: "hidden" }}
                      >
                        {progress > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: `${progress}%`,
                              background: "rgba(0,0,0,0.22)",
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <span className={`g-st ${stCls}`} style={{ fontSize: 9, padding: "2px 5px" }}>{stLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
