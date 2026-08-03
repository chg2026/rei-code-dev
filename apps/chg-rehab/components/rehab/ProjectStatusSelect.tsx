"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "@prisma/client";

export const PROJECT_STATUS_ORDER: ProjectStatus[] = ["Planning", "Active", "OnHold", "Complete"];

const STATUS_META: Record<ProjectStatus, { label: string; bg: string; fg: string }> = {
  Planning: { label: "Planning", bg: "#ECEAE2", fg: "#6B6A66" },
  Active: { label: "Active", bg: "#DCEBFB", fg: "#1F4FA8" },
  OnHold: { label: "On hold", bg: "#FBEFD3", fg: "#8A5A14" },
  Complete: { label: "Complete", bg: "#D9F2E4", fg: "#1D7A4D" },
};

export default function ProjectStatusSelect({
  projectId,
  currentStatus,
  canEdit,
}: {
  projectId: string;
  currentStatus: ProjectStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>(currentStatus);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setStatus(currentStatus), [currentStatus]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function choose(next: ProjectStatus, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    if (next === status || !canEdit) return;
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/rehab/${encodeURIComponent(projectId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        if (!response.ok) throw new Error(String(response.status));
        router.refresh();
      } catch {
        setStatus(previous);
      }
    });
  }

  const meta = STATUS_META[status] ?? STATUS_META.Planning;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="st-badge"
        disabled={!canEdit || pending}
        onClick={() => canEdit && setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={canEdit ? "Change project status" : "You do not have permission to change project status"}
        style={{
          background: meta.bg,
          color: meta.fg,
          border: "none",
          cursor: canEdit && !pending ? "pointer" : "default",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          opacity: pending ? 0.7 : 1,
        }}
      >
        {meta.label}{canEdit && <span style={{ fontSize: 7, opacity: 0.7 }}>▾</span>}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Project status"
          style={{
            position: "absolute", top: "100%", left: 0, zIndex: 9999,
            marginTop: 3, minWidth: 140, padding: 3,
            background: "var(--bg-primary, #fff)", border: "0.5px solid var(--border-mid)",
            borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
          }}
        >
          {PROJECT_STATUS_ORDER.map((value) => {
            const option = STATUS_META[value];
            const active = value === status;
            return (
              <button
                key={value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={(event) => choose(value, event)}
                style={{
                  display: "flex", width: "100%", padding: "6px 8px", border: "none",
                  borderRadius: 4, background: active ? "var(--bg-secondary)" : "transparent",
                  color: "var(--text-primary)", cursor: "pointer", textAlign: "left", fontSize: 11,
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}