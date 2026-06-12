"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PhaseStatus } from "@prisma/client";

/** Canonical display order for the phase-status dropdown. */
export const PHASE_STATUS_ORDER: PhaseStatus[] = [
  "NotStarted",
  "InProgress",
  "Stuck",
  "ReadyForReview",
  "PendingInspection",
  "WaitingOnMaterials",
  "Delayed",
  "OnHold",
  "Done",
  "Canceled",
];

/** Label + badge colours for every phase status. Single source of truth. */
export const PHASE_STATUS_META: Record<PhaseStatus, { label: string; bg: string; fg: string }> = {
  NotStarted: { label: "Not started", bg: "#ECEAE2", fg: "#6B6A66" },
  InProgress: { label: "In progress", bg: "#DCEBFB", fg: "#1F4FA8" },
  Stuck: { label: "Stuck", bg: "#FBE0DC", fg: "#A12B1E" },
  ReadyForReview: { label: "Ready for review", bg: "#ECE3FB", fg: "#6B3FA8" },
  PendingInspection: { label: "Pending inspection", bg: "#D7F0EC", fg: "#1F7A6B" },
  WaitingOnMaterials: { label: "Waiting on materials", bg: "#FBEFD3", fg: "#8A5A14" },
  Delayed: { label: "Delayed", bg: "#FBE0CF", fg: "#A8541F" },
  OnHold: { label: "On hold", bg: "#E2E5EA", fg: "#4A5568" },
  Done: { label: "Done", bg: "#D9F2E4", fg: "#1D7A4D" },
  Canceled: { label: "Canceled", bg: "#E8E6E0", fg: "#8A8884" },
};

export function phaseStatusLabel(s: PhaseStatus): string {
  return PHASE_STATUS_META[s]?.label ?? String(s);
}

export default function PhaseStatusSelect({
  phaseId,
  projectId,
  currentStatus,
  incompleteChecklist = false,
  onUpdate,
  size = "sm",
}: {
  phaseId: string;
  projectId: string;
  currentStatus: PhaseStatus;
  /** When true, choosing "Done" prompts a confirm() first. */
  incompleteChecklist?: boolean;
  onUpdate?: (newStatus: PhaseStatus) => void;
  size?: "sm" | "xs";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PhaseStatus>(currentStatus);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setStatus(currentStatus), [currentStatus]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function choose(next: PhaseStatus, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    if (next === status) return;
    if (next === "Done" && incompleteChecklist) {
      const ok = window.confirm(
        "This phase still has incomplete checklist items. Mark it as Done anyway?"
      );
      if (!ok) return;
    }
    const prev = status;
    setStatus(next); // optimistic
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/rehab/${encodeURIComponent(projectId)}/phases/${phaseId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          }
        );
        if (!res.ok) throw new Error(String(res.status));
        onUpdate?.(next);
        router.refresh();
      } catch {
        setStatus(prev); // rollback
      }
    });
  }

  const meta = PHASE_STATUS_META[status] ?? PHASE_STATUS_META.NotStarted;
  const fontSize = size === "xs" ? 9 : 10;

  return (
    <div
      ref={ref}
      style={{ position: "relative", display: "inline-block" }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="st-badge"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          background: meta.bg,
          color: meta.fg,
          border: "none",
          cursor: pending ? "default" : "pointer",
          fontSize,
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          opacity: pending ? 0.7 : 1,
        }}
      >
        {meta.label}
        <span style={{ fontSize: 7, opacity: 0.7 }}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 3,
            zIndex: 9999,
            background: "var(--bg-primary, #fff)",
            border: "0.5px solid var(--border-mid)",
            borderRadius: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
            minWidth: 158,
            padding: 3,
          }}
        >
          {PHASE_STATUS_ORDER.map((s) => {
            const mm = PHASE_STATUS_META[s];
            const active = s === status;
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={active}
                onClick={(e) => choose(s, e)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = active ? "var(--bg-secondary)" : "transparent")
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  textAlign: "left",
                  padding: "5px 7px",
                  border: "none",
                  background: active ? "var(--bg-secondary)" : "transparent",
                  cursor: "pointer",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "var(--text-primary)",
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: mm.bg,
                    border: `1px solid ${mm.fg}`,
                    flexShrink: 0,
                  }}
                />
                {mm.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
