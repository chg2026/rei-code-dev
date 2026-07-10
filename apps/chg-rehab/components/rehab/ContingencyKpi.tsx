"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * "Contingency reserve" KPI card on the Budget & Costs header. Admins / PMs
 * (rehab edit permission, checked server-side by the project PATCH route) can
 * edit the amount inline; everyone else sees a read-only figure. The reserve
 * is a labeled line only — it is never folded into per-phase budget math.
 */
export default function ContingencyKpi({
  projectCode,
  initial,
  canEdit,
}: {
  projectCode: string;
  initial: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(initial || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [, startTransition] = useTransition();

  async function save() {
    const n = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError(true);
      return;
    }
    if (n === initial) {
      setEditing(false);
      setError(false);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/rehab/${encodeURIComponent(projectCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contingency: n }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEditing(false);
      startTransition(() => router.refresh());
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="kpi-card">
      <div className="kpi-label">Contingency reserve</div>
      {editing ? (
        <input
          autoFocus
          type="number"
          min={0}
          step="0.01"
          value={value}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setValue(String(initial || ""));
              setEditing(false);
              setError(false);
            }
          }}
          style={{
            width: "100%",
            fontSize: 16,
            fontWeight: 600,
            padding: "2px 4px",
            border: `0.5px solid ${error ? "var(--red-txt)" : "var(--border-mid)"}`,
            borderRadius: 4,
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
          }}
        />
      ) : (
        <div
          className="kpi-val"
          onClick={canEdit ? () => { setValue(String(initial || "")); setEditing(true); } : undefined}
          style={canEdit ? { cursor: "pointer" } : undefined}
          title={canEdit ? "Click to edit the contingency reserve" : undefined}
        >
          {fmt$(initial)}
        </div>
      )}
      <div className="kpi-sub">
        {saving ? "Saving…" : error ? "Could not save" : canEdit ? "Reserve · click to edit" : "Reserve"}
      </div>
    </div>
  );
}
