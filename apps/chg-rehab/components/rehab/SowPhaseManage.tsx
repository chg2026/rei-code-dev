"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Rename + delete controls for a single SOW job type. Rendered inside the row
 * expand. Rename PATCHes `name` on the phase route; delete calls DELETE on the
 * same route, which BLOCKS (409) when the job type has financial history —
 * we surface that message inline instead of removing the row.
 */
export default function SowPhaseManage({
  projectCode,
  phaseId,
  phaseNumber,
  name,
  canEdit,
}: {
  projectCode: string;
  phaseId: string;
  phaseNumber: number;
  name: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return null;

  const base = `/api/rehab/${encodeURIComponent(projectCode)}/phases/${phaseId}`;

  function saveName() {
    const next = value.trim();
    if (!next) {
      setError("Job type name cannot be empty.");
      return;
    }
    if (next === name) {
      setEditing(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(base, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: next }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || "Rename failed");
        }
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function doDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(base, { method: "DELETE" });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          const msg = [j?.error, j?.details].filter(Boolean).join(" ");
          throw new Error(msg || "Delete failed");
        }
        setConfirming(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--text-tertiary)",
    marginBottom: 4,
  };
  const inputStyle: React.CSSProperties = {
    fontSize: 11,
    padding: "4px 6px",
    border: "0.5px solid var(--border-lo)",
    borderRadius: 4,
    background: "var(--bg-surface, #fff)",
  };

  return (
    <div
      style={{
        padding: "10px 14px",
        borderTop: "0.5px solid var(--border-lo)",
        background: "var(--bg-subtle, #faf9f6)",
        display: "grid",
        gap: 8,
      }}
      // Stop clicks in here from collapsing the row.
      onClick={(e) => e.stopPropagation()}
    >
      <div style={labelStyle}>Manage job type</div>

      {/* Rename */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {editing ? (
          <>
            <input
              value={value}
              disabled={pending}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setValue(name);
                  setEditing(false);
                  setError(null);
                }
              }}
              style={{ ...inputStyle, flex: 1, minWidth: 160 }}
              placeholder="Job type name"
            />
            <button className="btn-sm" disabled={pending || !value.trim()} onClick={saveName}>
              {pending ? "Saving…" : "Save name"}
            </button>
            <button
              className="btn-sm"
              disabled={pending}
              onClick={() => {
                setValue(name);
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, flex: 1 }}>
              Code {phaseNumber} · <strong>{name}</strong>
            </span>
            <button className="btn-sm" disabled={pending} onClick={() => setEditing(true)}>
              Rename
            </button>
          </>
        )}
      </div>

      {/* Delete */}
      {confirming ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "6px 8px",
            border: "0.5px solid var(--red-txt, #B42318)",
            borderRadius: 4,
            background: "var(--red-bg, #FEF3F2)",
          }}
        >
          <span style={{ fontSize: 11, flex: 1, color: "var(--red-txt, #B42318)" }}>
            Delete &ldquo;{name}&rdquo;? This can&apos;t be undone.
          </span>
          <button className="btn-sm" disabled={pending} onClick={doDelete} style={{ color: "var(--red-txt, #B42318)" }}>
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button className="btn-sm" disabled={pending} onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      ) : (
        <div>
          <button
            className="btn-sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
            style={{ color: "var(--red-txt, #B42318)" }}
          >
            Delete job type
          </button>
        </div>
      )}

      {error && <div style={{ fontSize: 10, color: "var(--red-txt, #B42318)" }}>{error}</div>}
    </div>
  );
}
