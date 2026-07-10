"use client";

import { useCallback, useEffect, useState } from "react";

type Level = "none" | "view" | "edit";
const LEVELS: Level[] = ["none", "view", "edit"];

type LabelRow = {
  id: string;
  label: string;
  ord: number;
  pm: string;
  gc: string;
  sub: string;
  inspector: string;
  adminLock: boolean;
  locked: boolean;
};

type Feature = { key: string; label: string };

type Role = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: Record<string, string>;
  assignedCount?: number;
};

const ROLE_COLS: { key: "pm" | "gc" | "sub" | "inspector"; label: string }[] = [
  { key: "pm", label: "PM" },
  { key: "gc", label: "GC" },
  { key: "sub", label: "Sub" },
  { key: "inspector", label: "Inspector" },
];

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      detail = j.error || "";
    } catch {
      /* noop */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "#111",
        color: "#fff",
        padding: "8px 14px",
        borderRadius: 4,
        fontSize: 12,
        zIndex: 1000,
      }}
    >
      {message}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "3px 6px",
  borderRadius: 4,
  border: "1px solid var(--border-mid, #e5e7eb)",
  background: "#fff",
};

const btnPrimary: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 4,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 4,
  border: "1px solid var(--border-mid, #e5e7eb)",
  background: "transparent",
  color: "var(--text-primary)",
  cursor: "pointer",
};

export default function PermissionsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [rows, setRows] = useState<LabelRow[]>([]);
  const [savingGrid, setSavingGrid] = useState(false);
  const [gridDirty, setGridDirty] = useState(false);

  const [features, setFeatures] = useState<Feature[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [busy, setBusy] = useState(false);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 2400);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [perm, roleData] = await Promise.all([
        jsonFetch<{ labelRows: LabelRow[] }>("/api/admin/permissions"),
        jsonFetch<{ features: Feature[]; roles: Role[] }>("/api/admin/roles"),
      ]);
      setRows(perm.labelRows);
      setGridDirty(false);
      setFeatures(roleData.features);
      setRoles(roleData.roles);
      setSelectedRoleId((prev) =>
        prev && roleData.roles.some((r) => r.id === prev)
          ? prev
          : roleData.roles.find((r) => !r.isSystem)?.id ??
            roleData.roles[0]?.id ??
            null
      );
    } catch (e) {
      setError((e as Error).message || "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Label grid ──────────────────────────────────────────────────────
  function setCell(id: string, col: "pm" | "gc" | "sub" | "inspector", value: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [col]: value } : r))
    );
    setGridDirty(true);
  }

  async function saveGrid() {
    setSavingGrid(true);
    try {
      await jsonFetch("/api/admin/permissions", {
        method: "PUT",
        body: JSON.stringify({
          rows: rows.map((r) => ({
            id: r.id,
            pm: r.pm,
            gc: r.gc,
            sub: r.sub,
            inspector: r.inspector,
          })),
        }),
      });
      setGridDirty(false);
      showToast("Permissions saved");
    } catch (e) {
      showToast((e as Error).message || "Save failed");
    } finally {
      setSavingGrid(false);
    }
  }

  // ── Custom roles ────────────────────────────────────────────────────
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    const name = newRoleName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { role } = await jsonFetch<{ role: Role }>("/api/admin/roles", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setRoles((prev) => [...prev, role]);
      setSelectedRoleId(role.id);
      setNewRoleName("");
      showToast("Role created");
    } catch (e) {
      showToast((e as Error).message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function renameRole(role: Role) {
    const name = prompt("Rename role", role.name)?.trim();
    if (!name || name === role.name) return;
    setBusy(true);
    try {
      const { role: updated } = await jsonFetch<{ role: Role }>(
        `/api/admin/roles/${role.id}`,
        { method: "PATCH", body: JSON.stringify({ name }) }
      );
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, name: updated.name } : r)));
      showToast("Role renamed");
    } catch (e) {
      showToast((e as Error).message || "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole(role: Role) {
    const warn = role.assignedCount
      ? `${role.assignedCount} member(s) are on "${role.name}". They'll revert to their base role. Delete anyway?`
      : `Delete custom role "${role.name}"?`;
    if (!confirm(warn)) return;
    setBusy(true);
    try {
      await jsonFetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      setSelectedRoleId((prev) => (prev === role.id ? null : prev));
      showToast("Role deleted");
    } catch (e) {
      showToast((e as Error).message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function setRolePerm(roleId: string, feature: string, level: string) {
    setRoles((prev) =>
      prev.map((r) =>
        r.id === roleId
          ? { ...r, permissions: { ...r.permissions, [feature]: level } }
          : r
      )
    );
  }

  async function saveRolePermissions(role: Role) {
    setBusy(true);
    try {
      await jsonFetch(`/api/admin/roles/${role.id}`, {
        method: "PATCH",
        body: JSON.stringify({ permissions: role.permissions }),
      });
      showToast("Role permissions saved");
    } catch (e) {
      showToast((e as Error).message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: "var(--text-tertiary)" }}>
        Loading permissions…
      </div>
    );
  }

  return (
    <div className="admin-wrap" style={{ padding: 24, maxWidth: 1040 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Permissions</h1>
      <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 18 }}>
        Control what each role can see and do. Admins always have full access.
      </div>

      {error && (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            padding: "10px 12px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}{" "}
          <button onClick={() => void load()} style={{ ...btnGhost, marginLeft: 8 }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Role permission grid ──────────────────────────────────────── */}
      <div className="admin-panel active" style={{ marginBottom: 28 }}>
        <div className="admin-group">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: 10,
            }}
          >
            <div>
              <div className="admin-group-title">Role permissions</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                Per-feature access for the built-in roles. Locked rows are fixed
                by policy.
              </div>
            </div>
            <button
              onClick={() => void saveGrid()}
              disabled={savingGrid || !gridDirty}
              style={{ ...btnPrimary, opacity: savingGrid || !gridDirty ? 0.6 : 1 }}
            >
              {savingGrid ? "Saving…" : "Save changes"}
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 10px", color: "var(--text-tertiary)", fontWeight: 500 }}>
                    Feature
                  </th>
                  {ROLE_COLS.map((c) => (
                    <th
                      key={c.key}
                      style={{ textAlign: "left", padding: "8px 10px", color: "var(--text-tertiary)", fontWeight: 500, width: 110 }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const disabled = r.locked || r.adminLock;
                  return (
                    <tr key={r.id} style={{ borderTop: "0.5px solid var(--border-lo, #eee)" }}>
                      <td style={{ padding: "6px 10px" }}>
                        {r.label}
                        {disabled && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              color: "var(--text-tertiary)",
                              textTransform: "uppercase",
                            }}
                          >
                            {r.locked ? "Locked" : "Admin only"}
                          </span>
                        )}
                      </td>
                      {ROLE_COLS.map((c) => (
                        <td key={c.key} style={{ padding: "6px 10px" }}>
                          <select
                            value={r[c.key]}
                            disabled={disabled}
                            onChange={(e) => setCell(r.id, c.key, e.target.value)}
                            style={{ ...selectStyle, opacity: disabled ? 0.5 : 1 }}
                          >
                            {LEVELS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Custom roles ──────────────────────────────────────────────── */}
      <div className="admin-panel active">
        <div className="admin-group">
          <div className="admin-group-title">Custom roles</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.5, marginBottom: 10 }}>
            Create roles with a bespoke set of feature permissions, then assign
            them to teammates on the Team page.
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {roles.map((r) => {
              const active = r.id === selectedRoleId;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoleId(r.id)}
                  style={{
                    ...btnGhost,
                    borderColor: active ? "var(--marine, #1F4D5C)" : "var(--border-mid, #e5e7eb)",
                    background: active ? "var(--marine, #1F4D5C)" : "transparent",
                    color: active ? "#fff" : "var(--text-primary)",
                  }}
                >
                  {r.name}
                  {r.isSystem ? " · system" : ""}
                </button>
              );
            })}
          </div>

          <form onSubmit={createRole} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <input
              className="admin-input"
              placeholder="New custom role name"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              style={{ flex: "1 1 240px", minWidth: 200 }}
            />
            <button type="submit" disabled={busy || !newRoleName.trim()} style={{ ...btnPrimary, opacity: busy || !newRoleName.trim() ? 0.6 : 1 }}>
              Create role
            </button>
          </form>

          {selectedRole && (
            <div
              style={{
                marginTop: 16,
                padding: 14,
                border: "1px solid var(--border-mid, #e5e7eb)",
                borderRadius: 6,
                background: "var(--bg-soft, #fafafa)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {selectedRole.name}
                  {selectedRole.isSystem && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                      System role · read-only
                    </span>
                  )}
                </div>
                {!selectedRole.isSystem && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => void renameRole(selectedRole)} disabled={busy} style={btnGhost}>
                      Rename
                    </button>
                    <button
                      onClick={() => void deleteRole(selectedRole)}
                      disabled={busy}
                      style={{ ...btnGhost, color: "#991b1b" }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 16px", alignItems: "center" }}>
                {features.map((f) => (
                  <div key={f.key} style={{ display: "contents" }}>
                    <div style={{ fontSize: 13 }}>{f.label}</div>
                    <select
                      value={(selectedRole.permissions[f.key] as string) ?? "none"}
                      disabled={selectedRole.isSystem}
                      onChange={(e) => setRolePerm(selectedRole.id, f.key, e.target.value)}
                      style={{ ...selectStyle, opacity: selectedRole.isSystem ? 0.5 : 1, width: 90 }}
                    >
                      {LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {!selectedRole.isSystem && (
                <div style={{ marginTop: 14 }}>
                  <button
                    onClick={() => void saveRolePermissions(selectedRole)}
                    disabled={busy}
                    style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}
                  >
                    Save role permissions
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Toast message={toast} />
    </div>
  );
}
