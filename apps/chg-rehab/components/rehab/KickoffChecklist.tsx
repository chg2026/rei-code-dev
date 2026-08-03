"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { KickoffItem } from "@/lib/rehab/kickoff";

/**
 * Editable project Kickoff Checklist (CON-01). The PM toggles, adds, and
 * removes items; every change PATCHes the full list to
 * /api/rehab/[projectCode]/kickoff and refreshes. Read-only when the user
 * lacks rehab-edit permission.
 */
export default function KickoffChecklist({
  projectCode,
  initialItems,
  canEdit,
}: {
  projectCode: string;
  initialItems: KickoffItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<KickoffItem[]>(initialItems);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  async function persist(next: KickoffItem[]) {
    setSaving(true);
    setError(null);
    const prev = items;
    setItems(next); // optimistic
    try {
      const res = await fetch(`/api/rehab/${encodeURIComponent(projectCode)}/kickoff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setItems(prev); // rollback
        setError(j.error || `Could not save (${res.status})`);
        return;
      }
      const data = (await res.json().catch(() => null)) as { items?: KickoffItem[] } | null;
      if (data?.items) setItems(data.items);
      startTransition(() => router.refresh());
    } catch {
      setItems(prev);
      setError("Network error — change not saved.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: string) {
    if (!canEdit) return;
    persist(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  function remove(id: string) {
    if (!canEdit) return;
    persist(items.filter((i) => i.id !== id));
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const label = newLabel.trim();
    if (!label) return;
    // Stable, unique id derived from label + timestamp.
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
    let id = base;
    let n = 1;
    const existing = new Set(items.map((i) => i.id));
    while (existing.has(id)) id = `${base}-${++n}`;
    setNewLabel("");
    persist([...items, { id, label, done: false, doneById: null, doneAt: null }]);
  }

  return (
    <div
      style={{
        background: "var(--bg-primary)",
        border: "0.5px solid var(--border-mid)",
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Kickoff checklist</div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {done}/{total} complete
        </div>
      </div>

      <div className="spend-track" style={{ marginBottom: 12, background: "var(--bg-secondary)", borderRadius: 999, height: 6, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct === 100 ? "var(--green, #16a34a)" : "var(--blue-txt, #2563eb)",
            transition: "width 160ms ease",
          }}
        />
      </div>

      {items.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "6px 0" }}>
          No kickoff items. {canEdit ? "Add the items you want to track below." : ""}
        </div>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 6px",
              borderBottom: "0.5px solid var(--border-lo)",
            }}
          >
            <input
              type="checkbox"
              checked={item.done}
              disabled={!canEdit || saving}
              onChange={() => toggle(item.id)}
              aria-label={item.label}
              style={{ cursor: canEdit ? "pointer" : "default", flexShrink: 0 }}
            />
            <span
              style={{
                flex: 1,
                fontSize: 12,
                color: item.done ? "var(--text-tertiary)" : "var(--text-primary)",
                textDecoration: item.done ? "line-through" : "none",
              }}
            >
              {item.label}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={saving}
                aria-label={`Remove ${item.label}`}
                title="Remove item"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-tertiary)",
                  fontSize: 15,
                  lineHeight: 1,
                  padding: "0 4px",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <form onSubmit={add} style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            className="search-input"
            style={{ flex: 1, boxSizing: "border-box" }}
            placeholder="Add a kickoff item…"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            maxLength={200}
          />
          <button type="submit" className="btn" disabled={saving || !newLabel.trim()}>
            Add
          </button>
        </form>
      )}

      {error && (
        <div style={{ fontSize: 11, color: "#791F1F", background: "#FEF2F2", borderRadius: 4, padding: "6px 10px", marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
