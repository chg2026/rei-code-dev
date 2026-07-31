import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";
import { formatET } from "@/lib/datetime";
import { PhaseStatus } from "@prisma/client";
import { can } from "@/lib/permissions";
import { parseProjectMeta } from "@/lib/rehab/types";
import SowPhase from "@/components/rehab/SowPhase";
import PhaseStatusSelect from "@/components/rehab/PhaseStatusSelect";
import SowActions from "@/components/rehab/SowActions";
import SowPhaseDetails from "@/components/rehab/SowPhaseDetails";
import SowTemplatePicker from "@/components/rehab/SowTemplatePicker";
import SowAddPhase from "@/components/rehab/SowAddPhase";
import SowPhaseReorder from "@/components/rehab/SowPhaseReorder";
import SowPhaseManage from "@/components/rehab/SowPhaseManage";
import { ensureDefaultTemplates } from "@/lib/rehab/seed-templates";

export const dynamic = "force-dynamic";
const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default async function SowPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ phase?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();
  const canEdit = await can(user, "rehab", "edit");
  await ensureDefaultTemplates(user.companyId, user.id);

  const sp = (await searchParams) ?? {};
  const focusPhase = sp.phase ? parseInt(sp.phase, 10) : NaN;

  const totalValue = project.phases.reduce((acc, p) => acc + Number(p.budget ?? 0), 0);
  // "Addenda" = project-level change orders (phaseId null); ChangeOrder is the
  // single "change" object — the legacy ProjectAddendum table is no longer read.
  const addenda = project.changeOrders.filter((co) => co.phaseId === null);
  const latestAddendum = addenda[addenda.length - 1];
  const meta = parseProjectMeta(project.meta);

  // Pair phases with sow sections by index (both ordered)
  const sections = project.sowSections;
  // Phase ids in current display (sortOrder) order — drives the reorder controls.
  const orderedPhaseIds = project.phases.map((p) => p.id);

  return (
    <div className="tab-panel active">
      {latestAddendum && Number(latestAddendum.amount) !== 0 && (
        <div className="amber-bar">
          <span className="ab-badge">{latestAddendum.title} — Active</span>
          <span className="ab-text">{latestAddendum.reason || "Scope change applied."}</span>
          <div className="ab-r">
            {meta.originalEndDate && (
              <>
                <span className="orig-dl">{formatET(new Date(meta.originalEndDate), false)}</span>
                <span style={{ fontSize: 10, color: "var(--amber-txt)" }}>→</span>
              </>
            )}
            <span className="new-dl">{formatET(project.endDate, false)}</span>
          </div>
        </div>
      )}

      <div className="action-bar" style={{ position: "relative" }}>
        <div className="toggle-group">
          <button className="tg-btn active">SOW view</button>
          <button className="tg-btn" disabled title="Use Schedule tab for Gantt">
            Gantt view
          </button>
        </div>
        <button className="btn">Export PDF</button>
        {canEdit && project.phases.length === 0 && (
          <SowTemplatePicker projectCode={project.code} />
        )}
        {canEdit && (
          <SowAddPhase
            projectCode={project.code}
            phases={project.phases.map((p) => ({ id: p.id, number: p.number, name: p.name }))}
          />
        )}
        <SowActions
          projectCode={project.code}
          phases={project.phases.map((p) => ({ id: p.id, number: p.number, name: p.name }))}
          canEdit={canEdit}
        />
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Status:</span>
          <span className="cell-tag tag-paid" style={{ fontSize: 10 }}>
            Approved
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          <div className="sow-hd">
            <span></span>
            <span className="col-label">Job Type / Line item</span>
            <span className="col-label" style={{ textAlign: "right" }}>Days</span>
            <span className="col-label">Dates</span>
            <span className="col-label" style={{ textAlign: "right" }}>Estimated</span>
            <span className="col-label" style={{ textAlign: "right" }}>Actual</span>
            <span className="col-label">Status</span>
          </div>
          {project.phases.map((p, idx) => {
            const section = sections[idx];
            const days = p.startDate && p.endDate
              ? Math.max(1, Math.round((p.endDate.getTime() - p.startDate.getTime()) / 86_400_000) + 1)
              : 0;
            const stLabel =
              p.status === PhaseStatus.Done ? "Complete" : p.status === PhaseStatus.InProgress ? "Active" : "Not started";
            const pnClass =
              p.status === PhaseStatus.Done ? "pn-g" : p.status === PhaseStatus.InProgress ? "pn-b" : "pn-gr";
            const incompleteChecklist =
              p.checklistItems.length > 0 &&
              p.checklistItems.some((i) => i.status !== "Done" && i.status !== "NA");

            // Actual spend for this phase comes from Phase.actual (kept in sync
            // by recomputePhaseActuals on every invoice / stage write).
            const estimated = Number(p.budget ?? 0);
            const actual = p.actual == null ? null : Number(p.actual);
            const hasActual = actual != null && actual > 0;
            let actualDisplay: string;
            let actualColor: string;
            if (actual == null && p.status === PhaseStatus.NotStarted) {
              actualDisplay = "—";
              actualColor = "var(--text-tertiary)";
            } else if (hasActual && actual > estimated) {
              actualDisplay = `$${(actual as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              actualColor = "var(--red-txt, #B42318)";
            } else if (hasActual && p.status === PhaseStatus.Done) {
              actualDisplay = `$${(actual as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              actualColor = "var(--green-txt, #067647)";
            } else if (hasActual) {
              actualDisplay = `$${(actual as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              actualColor = "var(--text-secondary)";
            } else {
              actualDisplay = "$0.00";
              actualColor = "var(--text-tertiary)";
            }
            return (
              <SowPhase
                key={p.id}
                anchorId={`sow-phase-${p.number}`}
                defaultOpen={p.status === PhaseStatus.InProgress || idx === 0}
                forceOpen={!Number.isNaN(focusPhase) && focusPhase === p.number}
                header={
                  <>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                      {canEdit && (
                        <SowPhaseReorder
                          projectCode={project.code}
                          orderedIds={orderedPhaseIds}
                          index={idx}
                        />
                      )}
                      <div className={`pnum ${pnClass}`} title={`Cost code ${p.number}`}>{p.number}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                        {section?.lineItems.length || 0} line items · {stLabel}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, textAlign: "right" }}>{days}d</span>
                    <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                      {formatET(p.startDate, false)} – {formatET(p.endDate, false)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, textAlign: "right" }}>
                      {fmt$(Number(p.budget ?? 0))}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, textAlign: "right", color: actualColor }}>
                      {actualDisplay}
                    </span>
                    <PhaseStatusSelect
                      phaseId={p.id}
                      projectId={project.code}
                      currentStatus={p.status}
                      incompleteChecklist={incompleteChecklist}
                    />
                  </>
                }
              >
                <SowPhaseDetails
                  projectCode={project.code}
                  phaseId={p.id}
                  canEdit={canEdit}
                  description={p.description ?? null}
                  laborBudget={Number(p.laborBudget ?? 0)}
                  materialsBudget={Number(p.materialsBudget ?? 0)}
                  dependencies={p.dependencies ?? []}
                  acceptanceCriteria={p.acceptanceCriteria ?? []}
                  phaseRefs={project.phases.map((ph) => ({ number: ph.number, name: ph.name }))}
                  plannedStartDate={p.plannedStartDate ? p.plannedStartDate.toISOString().slice(0, 10) : ""}
                  estimatedDays={p.estimatedDays ?? 0}
                />
                {canEdit && (
                  <SowPhaseManage
                    projectCode={project.code}
                    phaseId={p.id}
                    phaseNumber={p.number}
                    name={p.name}
                    canEdit={canEdit}
                  />
                )}
                {section && section.lineItems.length > 0 ? (
                  <>
                    <div className="li-hd">
                      <span className="col-label">Line item</span>
                      <span className="col-label" style={{ textAlign: "right" }}>Estimated</span>
                      <span className="col-label" style={{ textAlign: "right" }}>Actual</span>
                      <span className="col-label">Status</span>
                    </div>
                    {section.lineItems.map((li) => {
                      const est = Number(li.totalCost ?? 0);
                      const phaseDone = p.status === PhaseStatus.Done;
                      const phaseActive = p.status === PhaseStatus.InProgress;
                      const isCO = /\(CO\)|CO\)/.test(li.description);
                      const actClass = isCO && phaseActive ? "li-act-a" : phaseDone ? "li-act-g" : "li-est";
                      const actVal = phaseDone || isCO ? `$${est.toLocaleString()}` : "—";
                      const tagCls = phaseDone ? "tag-paid" : phaseActive ? "tag-pend" : "";
                      const tagLabel = phaseDone ? "Done" : phaseActive ? "In progress" : "Pending";
                      return (
                        <div className="li-row" key={li.id}>
                          <div>
                            <div className="li-name">{li.description}</div>
                            {li.notes && <div className="li-sub">{li.notes}</div>}
                          </div>
                          <div className="li-est">${est.toLocaleString()}</div>
                          <div className={actClass}>{actVal}</div>
                          <span
                            className={`cell-tag ${tagCls}`}
                            style={!tagCls ? { background: "#F1EFE8", color: "#5F5E5A" } : undefined}
                          >
                            {tagLabel}
                          </span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div style={{ padding: "8px 14px", fontSize: 10, color: "var(--text-tertiary)" }}>
                    No line items recorded.
                  </div>
                )}
              </SowPhase>
            );
          })}
        </div>
        <div className="body-side">
          <div className="sb-sec" style={{ padding: "10px 12px" }}>
            <div className="sb-hd" style={{ padding: "0 0 6px" }}>SOW metadata</div>
            <div className="ip-row"><span className="ir-lbl">Total value</span><span className="ir-val">{fmt$(totalValue)}</span></div>
            <div className="ip-row"><span className="ir-lbl">Job Types</span><span className="ir-val">{project.phases.length}</span></div>
            <div className="ip-row"><span className="ir-lbl">Signed</span><span className="ir-val">{formatET(project.startDate, false)}</span></div>
            <div className="ip-row"><span className="ir-lbl">Addenda</span><span className="ir-val">{addenda.length}</span></div>
          </div>
          <div className="sb-sec" style={{ padding: "10px 12px" }}>
            <div className="sb-hd" style={{ padding: "0 0 6px" }}>Version history</div>
            <div style={{ padding: "4px 0", borderBottom: "0.5px solid var(--border-lo)" }}>
              <div style={{ fontSize: 10, fontWeight: 500 }}>Original SOW</div>
              <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                {formatET(project.startDate, false)} · v1.0
              </div>
            </div>
            {addenda.map((a) => (
              <div key={a.id} style={{ padding: "4px 0", borderBottom: "0.5px solid var(--border-lo)" }}>
                <div style={{ fontSize: 10, fontWeight: 500 }}>{a.title}</div>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                  {formatET(a.createdAt, false)}
                  {Number(a.amount) !== 0 ? ` · +$${Number(a.amount).toLocaleString()}` : ""}
                  {a.daysDelta !== 0 ? ` · +${a.daysDelta} day${a.daysDelta === 1 ? "" : "s"}` : ""}
                  {Number(a.amount) === 0 && a.daysDelta === 0 ? " · No change" : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
