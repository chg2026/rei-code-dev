"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Member = {
  id: string;
  email: string | null;
  name: string;
  role: string;
  joinedAt: string;
};

type PendingInvite = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
};

type MembersResponse = {
  members?: Member[];
  pendingInvites?: PendingInvite[];
};

const INVITE_ROLES: { value: string; label: string }[] = [
  { value: "Admin", label: "Admin" },
  { value: "ProjectManager", label: "Project Manager" },
  { value: "GeneralContractor", label: "General Contractor" },
  { value: "Inspector", label: "Inspector" },
];

function roleLabel(role: string): string {
  return INVITE_ROLES.find((r) => r.value === role)?.label ?? role;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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
      const j = (await res.json()) as { error?: string; message?: string };
      detail = j.error || j.message || "";
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

export default function TeamSettingsClient({
  userName,
  userEmail,
  role,
}: {
  userName: string;
  userEmail: string | null;
  role: string;
}) {
  const isAdmin = role === "Admin";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("ProjectManager");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 2400);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await jsonFetch<MembersResponse>(
        "/api/settings/team/members",
      );
      setMembers(data.members ?? []);
      setPending(data.pendingInvites ?? []);
    } catch (e) {
      setError((e as Error).message || "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await jsonFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      setInviteEmail("");
      setInviteRole("ProjectManager");
      showToast("Invite sent");
      await loadAll();
    } catch (err) {
      showToast((err as Error).message || "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function resendInvite(inviteId: string) {
    setBusyId(inviteId);
    try {
      const res = await jsonFetch<{ emailDelivered?: boolean }>(
        `/api/settings/team/invites/${encodeURIComponent(inviteId)}/resend`,
        { method: "POST" },
      );
      showToast(
        res.emailDelivered ? "Invite resent" : "Invite refreshed (email not sent)",
      );
      await loadAll();
    } catch (err) {
      showToast((err as Error).message || "Resend failed");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!confirm("Cancel this pending invite?")) return;
    setBusyId(inviteId);
    try {
      await jsonFetch(
        `/api/settings/team/invites/${encodeURIComponent(inviteId)}`,
        { method: "DELETE" },
      );
      showToast("Invite cancelled");
      await loadAll();
    } catch (err) {
      showToast((err as Error).message || "Cancel failed");
    } finally {
      setBusyId(null);
    }
  }

  const memberCount = useMemo(() => members.length, [members]);

  return (
    <div className="admin-wrap" style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Team</h1>
      <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 18 }}>
        {userName}
        {userEmail ? ` · ${userEmail}` : ""} · {roleLabel(role)}
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
          <button
            onClick={() => void loadAll()}
            style={{
              marginLeft: 8,
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 4,
              border: "1px solid #991b1b",
              background: "transparent",
              color: "#991b1b",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="admin-panel active">
        {/* Team Members */}
        <div className="admin-group">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 16,
              marginBottom: 8,
            }}
          >
            <div>
              <div className="admin-group-title">Team Members</div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  lineHeight: 1.5,
                }}
              >
                People in your organization with access to CHG Platform.
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
              }}
            >
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </div>
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "10px 0" }}>
              Loading…
            </div>
          ) : members.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "10px 0" }}>
              No team members yet.
            </div>
          ) : (
            members.map((m) => (
              <div className="admin-row" key={`m-${m.id}`}>
                <div className="admin-info">
                  <div className="admin-lbl">{m.name}</div>
                  <div className="admin-desc">
                    {m.email ?? "—"} · {roleLabel(m.role)} · joined{" "}
                    {formatDate(m.joinedAt)}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Invite form */}
          <div
            style={{
              marginTop: 14,
              padding: 12,
              border: "1px solid var(--border-mid, #e5e7eb)",
              borderRadius: 6,
              background: "var(--bg-soft, #fafafa)",
            }}
          >
            {isAdmin ? (
              <form
                onSubmit={sendInvite}
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              >
                <input
                  className="admin-input"
                  type="email"
                  required
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  style={{ flex: "1 1 240px", minWidth: 200 }}
                />
                <select
                  className="admin-input"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  style={{ width: 180 }}
                >
                  {INVITE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 4,
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "#fff",
                    cursor: inviting ? "not-allowed" : "pointer",
                    opacity: inviting ? 0.7 : 1,
                  }}
                >
                  {inviting ? "Sending…" : "Send invite"}
                </button>
              </form>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                Only account admins can invite teammates.
              </div>
            )}
          </div>
        </div>

        {/* Pending Invites */}
        <div className="admin-group">
          <div className="admin-group-title">Pending Invites</div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            Invitations that haven&apos;t been accepted yet.
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "10px 0" }}>
              Loading…
            </div>
          ) : pending.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "10px 0" }}>
              No pending invites.
            </div>
          ) : (
            pending.map((p) => (
              <div className="admin-row" key={`p-${p.id}`}>
                <div className="admin-info">
                  <div className="admin-lbl">
                    {p.email}{" "}
                    <span
                      style={{
                        fontSize: 10,
                        marginLeft: 6,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "var(--bg-mid, #f0f0f0)",
                        color: "var(--text-tertiary)",
                        textTransform: "uppercase",
                      }}
                    >
                      Pending
                    </span>
                  </div>
                  <div className="admin-desc">
                    Invited as {roleLabel(p.role)} · expires {formatDate(p.expiresAt)}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => void resendInvite(p.id)}
                      disabled={busyId === p.id}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 4,
                        border: "1px solid var(--border-mid, #e5e7eb)",
                        background: "transparent",
                        color: "var(--text-primary)",
                        cursor: busyId === p.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {busyId === p.id ? "Working…" : "Resend"}
                    </button>
                    <button
                      onClick={() => void revokeInvite(p.id)}
                      disabled={busyId === p.id}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 4,
                        border: "1px solid var(--border-mid, #e5e7eb)",
                        background: "transparent",
                        color: "#991b1b",
                        cursor: busyId === p.id ? "not-allowed" : "pointer",
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <Toast message={toast} />
    </div>
  );
}
