"use client";

import { useCallback, useEffect, useState } from "react";

type Department = { id: string; name: string; color: string | null };

const COLORS = ["#6366f1", "#1F4D5C", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#6B7280"];

export default function DepartmentsPanel() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/pm/spaces", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      setDepartments(d.spaces ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const name = newName.trim();
    if (!name) { setErr("Name is required."); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/pm/spaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Failed to create department");
      setNewName("");
      setNewColor(COLORS[0]);
      setCreating(false);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string) => {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/pm/spaces/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Failed to rename department");
      setEditingId(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (dep: Department) => {
    if (!window.confirm(`Delete "${dep.name}"? This removes its lists and tasks.`)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/pm/spaces/${dep.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Failed to delete department");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "24px 28px", maxWidth: 640 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Departments</h1>
        {!creating ? (
          <button type="button" onClick={() => { setCreating(true); setErr(null); }} style={btnPrimary}>+ New Department</button>
        ) : null}
      </div>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--text-secondary)" }}>
        Company departments organize tasks across the workspace. Only admins can manage them.
      </p>

      {err ? <div style={{ fontSize: 12, color: "var(--danger, #EF4444)", marginBottom: 12 }}>{err}</div> : null}

      {creating ? (
        <div style={{ ...card, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={fieldLabel}>Name</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); }}
              placeholder="e.g. Acquisitions"
              style={input}
            />
          </div>
          <div>
            <label style={fieldLabel}>Color</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  aria-label={c}
                  style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: newColor === c ? "2px solid var(--text-primary)" : "2px solid transparent", cursor: "pointer" }}
                />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={() => { setCreating(false); setNewName(""); setErr(null); }} style={btnGhost} disabled={busy}>Cancel</button>
            <button type="button" onClick={create} style={btnPrimary} disabled={busy}>{busy ? "Creating…" : "Create"}</button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div style={{ ...card, padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 14 }}>Loading…</div>
      ) : departments.length === 0 ? (
        <div style={{ ...card, padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 14 }}>
          No departments yet.
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          {departments.map((dep, i) => (
            <div
              key={dep.id}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                borderBottom: i < departments.length - 1 ? "0.5px solid var(--border-lo)" : "none",
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: dep.color ?? "#6366f1", flexShrink: 0 }} />
              {editingId === dep.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(dep.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => rename(dep.id)}
                  style={{ ...input, flex: 1 }}
                />
              ) : (
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{dep.name}</span>
              )}
              <button
                type="button"
                onClick={() => { setEditingId(dep.id); setEditName(dep.name); setErr(null); }}
                style={iconBtn}
                title="Rename department"
                disabled={busy}
              >✏️</button>
              <button
                type="button"
                onClick={() => remove(dep)}
                style={iconBtn}
                title="Delete department"
                disabled={busy}
              >🗑️</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--bg-primary, #fff)",
  border: "0.5px solid var(--border-lo)",
  borderRadius: 10,
};
const fieldLabel: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
  border: "1px solid var(--border-mid)", borderRadius: 6, outline: "none",
  color: "var(--text-primary)", background: "var(--bg-primary, #fff)",
};
const btnPrimary: React.CSSProperties = {
  padding: "7px 14px", fontSize: 13, fontFamily: "inherit", background: "var(--marine, #1F4D5C)",
  border: "1px solid var(--marine, #1F4D5C)", borderRadius: 6, cursor: "pointer", color: "#fff", fontWeight: 600,
};
const btnGhost: React.CSSProperties = {
  padding: "7px 14px", fontSize: 13, fontFamily: "inherit", background: "transparent",
  border: "1px solid var(--border-mid)", borderRadius: 6, cursor: "pointer", color: "var(--text-secondary)",
};
const iconBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "4px 6px", borderRadius: 4,
};
