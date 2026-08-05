"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type ContractorContact = {
  id: string;
  name: string;
  email: string | null;
  type: string;
  trade: string | null;
};

type Invitation = {
  id: string;
  status: string;
  role: string;
  emailSnapshot: string;
  expiresAt: string;
  inviteDeliveryStatus: string;
  contact: { id: string; name: string; email: string | null; type: string };
};

type Props = {
  projectId: string;
  contacts: ContractorContact[];
  canEdit: boolean;
};

const AGREEMENT_VERSION = "contractor-project-v1";
const ROLE_OPTIONS = [
  "General Contractor",
  "Subcontractor",
  "Electrician",
  "Plumber",
  "HVAC",
  "Other",
];

export function invitationIsResendable(invitation: Pick<Invitation, "status" | "expiresAt">, now = Date.now()) {
  return invitation.status === "Pending" && new Date(invitation.expiresAt).getTime() > now;
}

export function invitationIsActivatable(invitation: Pick<Invitation, "status">) {
  return invitation.status === "Accepted";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default function ContractorOnboarding({ projectId, contacts, canEdit }: Props) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [role, setRole] = useState(ROLE_OPTIONS[0]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const eligibleContacts = useMemo(
    () => contacts.filter((contact) => contact.type === "Contractor" || contact.type === "Subcontractor"),
    [contacts],
  );

  async function loadInvitations() {
    setLoading(true);
    try {
      const response = await fetch(`/api/contractor-portal/invitations?projectId=${encodeURIComponent(projectId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { invitations?: Invitation[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Could not load contractor invitations");
      setInvitations(payload?.invitations ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load contractor invitations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvitations();
    // The project id is the only input to this initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContactId || !role || !canEdit) return;
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/contractor-portal/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, contactId: selectedContactId, role, agreementVersion: AGREEMENT_VERSION }),
      });
      const payload = (await response.json().catch(() => null)) as { invitation?: Invitation; error?: string } | null;
      if (!response.ok || !payload?.invitation) throw new Error(payload?.error || "Could not create invitation");
      setInvitations((current) => [payload.invitation!, ...current.filter((item) => item.id !== payload.invitation!.id)]);
      setSelectedContactId("");
      setNotice(payload.invitation.status === "Pending" ? "Invitation created and is pending acceptance." : "Invitation updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create invitation");
    } finally {
      setBusy(null);
    }
  }

  async function mutateInvitation(invitation: Invitation, action: "resend" | "activate") {
    setBusy(`${action}:${invitation.id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/contractor-portal/invitations/${invitation.id}/${action}`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { invitation?: Invitation; error?: string } | null;
      if (!response.ok || !payload?.invitation) throw new Error(payload?.error || `Could not ${action} invitation`);
      setInvitations((current) => current.map((item) => (item.id === invitation.id ? payload.invitation! : item)));
      setNotice(action === "activate" ? "Invitation activated." : "Invitation resent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${action} invitation`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="contractor-onboarding-heading"
      style={{ margin: "0 0 12px", padding: "14px", border: "0.5px solid var(--border-lo)", borderRadius: 8, background: "var(--bg-secondary)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <div>
          <div id="contractor-onboarding-heading" className="sec-hd" style={{ margin: 0 }}>Rehab Manager · contractor onboarding</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
            Invite an existing company Contact first. Activation happens only after the contractor accepts and clears the server compliance gates.
          </div>
        </div>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>No active assignment is created from this form.</span>
      </div>

      {canEdit && (
        <form onSubmit={submitInvitation} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginTop: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: "var(--text-secondary)", minWidth: 220, flex: 1 }}>
            Company contractor / subcontractor Contact
            <select className="form-input" value={selectedContactId} onChange={(event) => setSelectedContactId(event.target.value)}>
              <option value="">Select a Contact…</option>
              {eligibleContacts.map((contact) => (
                <option key={contact.id} value={contact.id} disabled={!contact.email}>
                  {contact.name} · {contact.type}{contact.email ? "" : " · email required"}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: "var(--text-secondary)", minWidth: 180 }}>
            Role
            <select className="form-input" value={role} onChange={(event) => setRole(event.target.value)}>
              {ROLE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <button className="btn-sm btn-primary" type="submit" disabled={!selectedContactId || busy === "create"}>
            {busy === "create" ? "Creating…" : "Create pending invitation"}
          </button>
        </form>
      )}

      {error && <div role="alert" style={{ marginTop: 10, color: "var(--red-txt)", fontSize: 11 }}>{error}</div>}
      {notice && <div role="status" style={{ marginTop: 10, color: "var(--green-txt)", fontSize: 11 }}>{notice}</div>}

      <div style={{ marginTop: 12 }}>
        {loading ? <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Loading invitations…</div> : invitations.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>No contractor invitations for this project yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {invitations.map((invitation) => {
              const resendable = canEdit && invitationIsResendable(invitation);
              const activatable = canEdit && invitationIsActivatable(invitation);
              return (
                <div key={invitation.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderTop: "0.5px solid var(--border-lo)" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 12 }}>{invitation.contact.name}</strong>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}> · {invitation.role} · {invitation.emailSnapshot}</span>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      Invited {formatDate(invitation.expiresAt)} expiry · delivery {invitation.inviteDeliveryStatus}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: "var(--bg-primary)", color: "var(--text-primary)" }}>{invitation.status}</span>
                    {resendable && <button className="btn-sm" type="button" disabled={busy === `resend:${invitation.id}`} onClick={() => void mutateInvitation(invitation, "resend")}>{busy === `resend:${invitation.id}` ? "Resending…" : "Resend"}</button>}
                    {activatable && <button className="btn-sm btn-primary" type="button" disabled={busy === `activate:${invitation.id}`} onClick={() => void mutateInvitation(invitation, "activate")}>{busy === `activate:${invitation.id}` ? "Activating…" : "Activate"}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
