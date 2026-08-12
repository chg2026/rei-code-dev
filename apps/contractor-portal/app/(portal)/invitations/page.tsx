"use client";

import { useEffect, useState } from "react";

type Invitation = { id: string; company: { name: string }; project: { code: string; name: string }; role: string; trade: string | null; agreementVersion: string; expiresAt: string };

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState<Record<string, boolean>>({});
  async function load() {
    try {
      const response = await fetch("/api/invitations", { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || "Could not load invitations."); return; }
      setInvitations(body.invitations || []);
    } catch { setError("Could not load invitations. Check your connection and try again."); }
  }
  useEffect(() => { void load(); }, []);
  async function act(id: string, action: "accept" | "decline") {
    setError("");
    if (action === "accept" && !agreementAccepted[id]) { setError("Please confirm the agreement before accepting this invitation."); return; }
    setBusy(id);
    try {
      const response = await fetch(`/api/invitations/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action, ...(action === "accept" ? { agreementAccepted: true } : {}) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(body.error || "Invitation could not be updated."); else await load();
    } catch { setError("Invitation could not be updated. Check your connection and try again."); }
    finally { setBusy(""); }
  }
  return <div className="content">
    <div className="pg-hd"><div><div className="pg-title">Project invitations</div><div className="pg-sub">Review invitations from CHG companies. Acceptance records the agreement; activation and jobs remain controlled by CHG.</div></div></div>
    {error ? <div role="alert" className="login-error" style={{ marginBottom: 16 }}>{error}</div> : null}
    {invitations.length === 0 ? <div className="card"><div className="ctitle">No pending invitations</div><p className="pg-sub">New project invitations linked to this account will appear here.</p></div> : invitations.map((inv) => <div className="card" key={inv.id} style={{ marginBottom: 12 }}>
      <div className="chd"><div><div className="ctitle">{inv.project.code} · {inv.project.name}</div><div className="pg-sub">{inv.company.name}</div></div><span className="pill p-amber">Pending</span></div>
      <div style={{ margin: "14px 0", fontSize: 13 }}>Role: <strong>{inv.role}</strong>{inv.trade ? ` · ${inv.trade}` : ""}<br />Agreement version: {inv.agreementVersion}<br />Expires: {new Date(inv.expiresAt).toLocaleDateString()}</div>
      <label style={{ display: "block", marginBottom: 10, fontSize: 13 }}><input type="checkbox" checked={agreementAccepted[inv.id] === true} onChange={(event) => setAgreementAccepted((current) => ({ ...current, [inv.id]: event.target.checked }))} /> I confirm that I have reviewed and agree to version {inv.agreementVersion}.</label>
      <div style={{ display: "flex", gap: 8 }}><button className="btn btn-sm" disabled={busy === inv.id} onClick={() => void act(inv.id, "accept")}>{busy === inv.id ? "Saving…" : "Accept invitation"}</button><button className="btn btn-sm" disabled={busy === inv.id} onClick={() => void act(inv.id, "decline")}>Decline</button></div>
    </div>)}
  </div>;
}
