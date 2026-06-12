"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PhaseStatus } from "@prisma/client";
import PhaseStatusSelect from "./PhaseStatusSelect";

const DAY = 86_400_000;

export type GanttPhase = {
  id: string;
  number: number;
  name: string;
  status: string;
  /** Raw planned start (or legacy fallback), epoch ms, or null. */
  plannedStartMs: number | null;
  /** Raw planned end (or legacy fallback), epoch ms, or null. */
  plannedEndMs: number | null;
  estimatedDays: number;
  dependencies: number[];
  checklistDone: number;
  checklistTotal: number;
};

type Zoom = "week" | "month" | "project";

const LABEL_W = 168;
const ROW_H = 34;
const BAR_H = 14;
const AXIS_H = 26;
const BAR_TOP = (ROW_H - BAR_H) / 2;

const COLORS = {
  done: "#9FE1CB",
  act: "#85B7EB",
  pend: "#D3D1C7",
  critical: "#C0392B",
  shifted: "#F59E0B",
  stuck: "#E07A6B",
  review: "#B69BE6",
  inspect: "#5FBFAE",
  materials: "#E8C36A",
  delayed: "#D98445",
  hold: "#9AA3B0",
  canceled: "#BBB8B0",
  arrow: "#9A968A",
  arrowDelay: "#C0392B",
};

function statusColor(status: string): string {
  switch (status) {
    case "Done":
      return COLORS.done;
    case "InProgress":
      return COLORS.act;
    case "Stuck":
      return COLORS.stuck;
    case "ReadyForReview":
      return COLORS.review;
    case "PendingInspection":
      return COLORS.inspect;
    case "WaitingOnMaterials":
      return COLORS.materials;
    case "Delayed":
      return COLORS.delayed;
    case "OnHold":
      return COLORS.hold;
    case "Canceled":
      return COLORS.canceled;
    default:
      return COLORS.pend; // NotStarted + unknown
  }
}

// Statuses that represent in-flight work and should reflect checklist progress.
const ACTIVE_STATUSES = new Set([
  "InProgress",
  "Stuck",
  "ReadyForReview",
  "PendingInspection",
  "WaitingOnMaterials",
  "Delayed",
]);

function progressFor(p: GanttPhase): number {
  if (p.status === "Done") return 100;
  if (ACTIVE_STATUSES.has(p.status)) {
    return p.checklistTotal > 0
      ? Math.round((p.checklistDone / p.checklistTotal) * 100)
      : 50;
  }
  return 0; // NotStarted, OnHold, Canceled
}

function fmtMD(ms: number | null): string {
  if (ms == null) return "—";
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

type Computed = {
  start: number | null;
  end: number | null;
  durMs: number;
  shifted: boolean;
};

export default function GanttChart({
  phases,
  projectId,
}: {
  phases: GanttPhase[];
  projectId: string;
}) {
  const [zoom, setZoom] = useState<Zoom>("month");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(900);
  const [hovered, setHovered] = useState<number | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function enterBar(n: number) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(n);
  }
  function leaveBar() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(null), 160);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    const sorted = [...phases].sort((a, b) => a.number - b.number);

    // ENHANCEMENT 1 — dependency-aware scheduling (forward pass in number order).
    const comp = new Map<number, Computed>();
    for (const p of sorted) {
      const durDays =
        p.estimatedDays > 0
          ? p.estimatedDays
          : p.plannedStartMs != null && p.plannedEndMs != null
            ? Math.max(1, Math.round((p.plannedEndMs - p.plannedStartMs) / DAY))
            : 0;
      const durMs = durDays * DAY;
      const deps = p.dependencies
        .map((n) => comp.get(n))
        .filter((c): c is Computed => !!c && c.end != null);

      let start: number | null;
      let end: number | null;
      let shifted = false;

      if (deps.length === 0) {
        start = p.plannedStartMs;
        end = p.plannedEndMs ?? (start != null ? start + durMs : null);
      } else {
        const latest = Math.max(...deps.map((d) => d.end as number));
        if (p.plannedStartMs == null || latest > p.plannedStartMs) {
          start = latest + DAY;
          end = start + durMs;
          shifted = true;
        } else {
          start = p.plannedStartMs;
          end = p.plannedEndMs ?? start + durMs;
        }
      }
      comp.set(p.number, { start, end, durMs, shifted });
    }

    // Chart range — spans all computed dates, padded, and always includes today.
    const starts = sorted
      .map((p) => comp.get(p.number)!.start)
      .filter((v): v is number => v != null);
    const ends = sorted
      .map((p) => comp.get(p.number)!.end)
      .filter((v): v is number => v != null);
    const now = Date.now();
    const hasData = starts.length > 0 && ends.length > 0;
    const minStart = hasData ? Math.min(...starts, now) : now;
    const maxEnd = hasData ? Math.max(...ends, now) : now + 7 * DAY;
    const rangeStart = minStart - DAY;
    const rangeEnd = maxEnd + DAY;
    const totalDays = Math.max(1, Math.round((rangeEnd - rangeStart) / DAY));

    const projectEnd = ends.length ? Math.max(...ends) : null;

    // ENHANCEMENT 3 — critical path via a CPM-style backward pass.
    // Latest-finish (LF) is propagated from the project end through the
    // dependency graph using the 1-day finish→start lag; a phase is critical
    // when its total float is ~0 (delaying it by a day moves the project end).
    const succ = new Map<number, number[]>();
    for (const p of sorted) {
      for (const d of p.dependencies) {
        succ.set(d, [...(succ.get(d) ?? []), p.number]);
      }
    }
    const lf = new Map<number, number>();
    const crit = new Map<number, boolean>();
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      const c = comp.get(p.number)!;
      if (c.end == null || projectEnd == null) {
        crit.set(p.number, false);
        continue;
      }
      const sucs = succ.get(p.number) ?? [];
      let latestFinish: number;
      if (sucs.length === 0) {
        latestFinish = projectEnd;
      } else {
        latestFinish = Math.min(
          ...sucs.map((sn) => {
            const sc = comp.get(sn);
            const sLf = lf.get(sn) ?? sc?.end ?? projectEnd;
            const sLs = sLf - (sc?.durMs ?? 0); // successor latest start
            return sLs - DAY; // 1-day lag between predecessor finish and successor start
          })
        );
      }
      lf.set(p.number, latestFinish);
      crit.set(p.number, Math.abs(latestFinish - c.end) < DAY / 2);
    }

    return { sorted, comp, rangeStart, rangeEnd, totalDays, projectEnd, crit };
  }, [phases]);

  const { sorted, comp, rangeStart, totalDays, crit } = model;

  const pxPerDay = useMemo(() => {
    if (zoom === "week") return 36;
    if (zoom === "month") return 11;
    // Project mode: fit all phases into the available track width. No per-day
    // floor here, otherwise long schedules overflow instead of fitting.
    const usable = Math.max(120, avail - LABEL_W - 24);
    return usable / totalDays;
  }, [zoom, avail, totalDays]);

  const trackW = totalDays * pxPerDay;
  const bodyH = sorted.length * ROW_H;
  const px = (ms: number) => ((ms - rangeStart) / DAY) * pxPerDay;
  const rowMid = (idx: number) => idx * ROW_H + ROW_H / 2;
  const idxByNum = new Map(sorted.map((p, i) => [p.number, i]));

  // Axis ticks.
  const stepDays = zoom === "week" ? 1 : zoom === "month" ? 7 : Math.max(1, Math.ceil(totalDays / 8));
  const ticks: number[] = [];
  for (let d = 0; d <= totalDays; d += stepDays) ticks.push(rangeStart + d * DAY);

  const todayX = px(Date.now());

  if (sorted.length === 0) {
    return (
      <div className="gantt-panel" style={{ padding: 24, fontSize: 12, color: "var(--text-tertiary)" }}>
        No phases to schedule yet.
      </div>
    );
  }

  // ENHANCEMENT 2 — dependency arrows (elbow polylines, red when driving a delay).
  const arrows: React.ReactNode[] = [];
  for (const p of sorted) {
    const succIdx = idxByNum.get(p.number);
    const sc = comp.get(p.number)!;
    if (succIdx == null || sc.start == null) continue;
    for (const depNum of p.dependencies) {
      const predIdx = idxByNum.get(depNum);
      const pc = comp.get(depNum);
      if (predIdx == null || !pc || pc.end == null) continue;
      const x1 = px(pc.end);
      const y1 = rowMid(predIdx);
      const x2 = px(sc.start);
      const y2 = rowMid(succIdx);
      const midX = Math.max(x1 + 8, x2 - 12);
      const causingDelay =
        p.plannedStartMs != null ? pc.end > p.plannedStartMs : sc.shifted;
      const color = causingDelay ? COLORS.arrowDelay : COLORS.arrow;
      arrows.push(
        <path
          key={`${depNum}->${p.number}`}
          d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
          fill="none"
          stroke={color}
          strokeWidth={1.25}
          markerEnd={`url(#gantt-arrow-${causingDelay ? "red" : "gray"})`}
        />
      );
    }
  }

  return (
    <div className="gantt-panel" style={{ overflow: "hidden" }}>
      {/* Toolbar: zoom + legend */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 12px",
          borderBottom: "0.5px solid var(--border-lo)",
          flexWrap: "wrap",
        }}
      >
        <div className="toggle-group">
          {(["week", "month", "project"] as Zoom[]).map((z) => (
            <button
              key={z}
              className={`tg-btn ${zoom === z ? "active" : ""}`}
              onClick={() => setZoom(z)}
              style={{ textTransform: "capitalize" }}
            >
              {z}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginLeft: "auto" }}>
          <LegendItem color={COLORS.critical} label="Critical path" />
          <LegendItem color={COLORS.act} label="In progress" />
          <LegendItem color={COLORS.done} label="Done" />
          <LegendItem color={COLORS.stuck} label="Stuck" />
          <LegendItem color={COLORS.delayed} label="Delayed" />
          <LegendItem color={COLORS.materials} label="Waiting" />
          <LegendItem color={COLORS.hold} label="On hold" />
          <LegendItem color={COLORS.pend} label="Not started" />
          <LegendItem color={COLORS.shifted} label="Shifted" />
        </div>
      </div>

      <div ref={scrollRef} style={{ display: "flex", flex: 1, overflow: "auto" }}>
        {/* Sticky label column */}
        <div
          style={{
            width: LABEL_W,
            flexShrink: 0,
            position: "sticky",
            left: 0,
            zIndex: 3,
            background: "var(--bg-surface, #fff)",
            borderRight: "0.5px solid var(--border-lo)",
          }}
        >
          <div style={{ height: AXIS_H, borderBottom: "0.5px solid var(--border-lo)", background: "var(--bg-secondary)" }} />
          {sorted.map((p) => {
            const c = comp.get(p.number)!;
            return (
              <div
                key={p.id}
                style={{
                  height: ROW_H,
                  padding: "0 12px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  borderBottom: "0.5px solid var(--border-lo)",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.number}. {p.name}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                  {fmtMD(c.start)} – {fmtMD(c.end)}
                  {c.shifted && <span style={{ color: COLORS.shifted, marginLeft: 4 }}>⚠ shifted</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Track canvas */}
        <div style={{ position: "relative", width: trackW, flexShrink: 0 }}>
          {/* Axis */}
          <div
            style={{
              height: AXIS_H,
              position: "sticky",
              top: 0,
              zIndex: 2,
              background: "var(--bg-secondary)",
              borderBottom: "0.5px solid var(--border-lo)",
            }}
          >
            {ticks.map((t, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: px(t),
                  top: 0,
                  height: AXIS_H,
                  fontSize: 9,
                  color: "var(--text-tertiary)",
                  paddingLeft: 3,
                  borderLeft: "0.5px solid var(--border-lo)",
                  lineHeight: `${AXIS_H}px`,
                  whiteSpace: "nowrap",
                }}
              >
                {fmtMD(t)}
              </div>
            ))}
          </div>

          {/* Bars + overlays */}
          <div style={{ position: "relative", height: bodyH }}>
            {/* Gridlines */}
            {ticks.map((t, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: px(t),
                  top: 0,
                  height: bodyH,
                  borderLeft: "0.5px solid var(--border-lo)",
                  opacity: 0.5,
                }}
              />
            ))}

            {/* SVG overlay: arrows + today line */}
            <svg
              width={trackW}
              height={bodyH}
              style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}
            >
              <defs>
                <marker id="gantt-arrow-gray" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill={COLORS.arrow} />
                </marker>
                <marker id="gantt-arrow-red" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill={COLORS.arrowDelay} />
                </marker>
              </defs>
              {arrows}
            </svg>

            {/* Today line */}
            {todayX >= 0 && todayX <= trackW && (
              <div style={{ position: "absolute", left: todayX, top: 0, height: bodyH, zIndex: 2 }}>
                <div style={{ position: "absolute", top: 0, height: bodyH, borderLeft: "1px dashed #C0392B" }} />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 2,
                    fontSize: 8,
                    fontWeight: 600,
                    color: "#C0392B",
                    background: "var(--bg-surface, #fff)",
                    padding: "0 2px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Today
                </div>
              </div>
            )}

            {/* Bars */}
            {sorted.map((p, idx) => {
              const c = comp.get(p.number)!;
              if (c.start == null) return null;
              const isCrit = crit.get(p.number) ?? false;
              const left = px(c.start);
              const end = c.end ?? c.start + Math.max(DAY, c.durMs);
              const width = Math.max(4, ((end - c.start) / DAY) * pxPerDay);
              const base = isCrit ? COLORS.critical : statusColor(p.status);
              const progress = progressFor(p);
              const incompleteChecklist =
                p.checklistTotal > 0 && p.checklistDone < p.checklistTotal;
              return (
                <div key={p.id} style={{ display: "contents" }}>
                  <div
                    onMouseEnter={() => enterBar(p.number)}
                    onMouseLeave={leaveBar}
                    style={{
                      position: "absolute",
                      top: idx * ROW_H + BAR_TOP,
                      left,
                      width,
                      height: BAR_H,
                      background: base,
                      borderRadius: 3,
                      overflow: "hidden",
                      zIndex: 2,
                      cursor: "pointer",
                    }}
                    title={`${p.name} · ${fmtMD(c.start)}–${fmtMD(c.end)} · ${progress}%${
                      isCrit ? " · critical path" : ""
                    }${c.shifted ? " · shifted" : ""}`}
                  >
                    {/* ENHANCEMENT 4 — progress fill (lighter shade from left) */}
                    {progress > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: `${progress}%`,
                          background: "rgba(255,255,255,0.55)",
                        }}
                      />
                    )}
                    {c.shifted && (
                      <div
                        style={{
                          position: "absolute",
                          right: 2,
                          top: 0,
                          bottom: 0,
                          display: "flex",
                          alignItems: "center",
                          fontSize: 9,
                          color: COLORS.shifted,
                          fontWeight: 700,
                        }}
                      >
                        ⚠
                      </div>
                    )}
                  </div>
                  {hovered === p.number && (
                    <div
                      onMouseEnter={() => enterBar(p.number)}
                      onMouseLeave={leaveBar}
                      style={{
                        position: "absolute",
                        top: idx * ROW_H + ROW_H - 4,
                        left: Math.max(0, Math.min(left, trackW - 196)),
                        zIndex: 5,
                        background: "var(--bg-surface, #fff)",
                        border: "0.5px solid var(--border-mid)",
                        borderRadius: 6,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
                        padding: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        minWidth: 188,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600 }}>
                        {p.number}. {p.name}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-tertiary)" }}>
                        {fmtMD(c.start)} – {fmtMD(c.end)} · {progress}%
                        {isCrit ? " · critical" : ""}
                      </div>
                      <PhaseStatusSelect
                        phaseId={p.id}
                        projectId={projectId}
                        currentStatus={p.status as PhaseStatus}
                        incompleteChecklist={incompleteChecklist}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-secondary)" }}>
      <span style={{ width: 12, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
