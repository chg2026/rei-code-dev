"use client";

import { useCallback, useEffect, useState } from "react";

type Department = { id: string; name: string; color: string | null };

function isDepartment(value: unknown): value is Department {
  if (!value || typeof value !== "object") return false;
  const department = value as Record<string, unknown>;
  return (
    typeof department.id === "string" &&
    typeof department.name === "string" &&
    (department.color === null || typeof department.color === "string")
  );
}

function apiError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as Record<string, unknown>).error;
  return typeof error === "string" && error ? error : fallback;
}

const COLORS = ["#6366f1", "#1F4D5C", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#6B7280"];

export default function DepartmentsPanel() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/pm/spaces", { cache: "no-store" });
      let body: unknown;
      try {
        body = await r.json();
      } catch {
        throw new Error("Failed to load departments");
      }
      if (!r.ok) throw new Error(apiError(body, "Failed to load departments"));
      if (!body || typeof body !== "object") throw new Error("Failed to load departments");
      const spaces = (body as Record<string, unknown>).spaces;
      if (!Array.isArray(spaces) || !spaces.every(isDepartment)) {
        throw new Error("Failed to load departments");
      }
      setDepartments(spaces);
    } catch (e) {
      setLoadError((e as Error).message || "Failed to load departments");
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
    <div className="departments-panel" style={{ padding: "24px 28px", maxWidth: 640 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>Departments</h1>
        {!creating && !loading && !loadError ? (
          <button type="button" onClick={() => { setCreating(true); setErr(null); }} style={btnPrimary}>+ New Department</button>
        ) : null}
      </div>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--text-secondary)" }}>
        Company departments organize tasks across the workspace. Only admins can manage them.
      </p>

      {err ? <div className="departments-mutation-error" style={{ fontSize: 12, color: "var(--danger, #EF4444)", marginBottom: 12 }}>{err}</div> : null}

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
        <section className="settings-state-panel" role="status" aria-live="polite">
          <div className="settings-state-icon" aria-hidden="true">◎</div>
          <h2>Loading departments…</h2>
          <p>Gathering your company&apos;s workspace structure.</p>
        </section>
      ) : loadError ? (
        <section className="settings-state-panel settings-state-error" role="alert">
          <div className="settings-state-icon" aria-hidden="true">!</div>
          <h2>Unable to load departments</h2>
          <p>{loadError}</p>
          <button type="button" className="settings-state-button" onClick={() => void load()}>Try again</button>
        </section>
      ) : departments.length === 0 ? (
        <section className="settings-state-panel settings-state-empty">
          <div className="settings-state-icon" aria-hidden="true">◇</div>
          <h2>No departments yet.</h2>
          <p>Create your first department to organize lists, statuses, and workspace tasks.</p>
        </section>
      ) : (
        <div className="departments-list" style={{ ...card, overflow: "hidden" }}>
          {departments.map((dep, i) => (
            <div
              key={dep.id}
              className="department-row"
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
                <span className="department-name" style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{dep.name}</span>
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
  background: "var(--chg-glass-surface-1)",
  border: "1px solid var(--chg-glass-line)",
  borderRadius: "var(--chg-radius-sm)",
  padding: 16,
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
