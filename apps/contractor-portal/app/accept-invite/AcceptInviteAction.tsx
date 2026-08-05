"use client";

import { useState } from "react";
import type { SafeInvitationSummary } from "@/lib/contractorProjectInvitationAcceptance";

export default function AcceptInviteAction({ token, summary }: { token: string; summary: SafeInvitationSummary }) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, agreementAccepted: accepted }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "This invitation could not be accepted.");
      setDone(true);
      setMessage("Agreement recorded. The invitation is accepted; no job or active access was created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This invitation could not be accepted.");
    } finally {
      setLoading(false);
    }
  }

  if (done) return <div role="status" style={{ marginTop: 20, color: "#166534", fontWeight: 600 }}>{message}</div>;
  return (
    <div style={{ marginTop: 20 }}>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
        <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={loading} />
        <span>I have reviewed and explicitly accept agreement version {summary.agreementVersion} for this invitation.</span>
      </label>
      <button type="button" className="login-cta" style={{ marginTop: 16, width: "100%" }} disabled={!accepted || loading} onClick={submit}>
        {loading ? "Accepting…" : "Accept invitation"}
      </button>
      {message ? <div role="alert" className="login-error" style={{ marginTop: 12 }}>{message}</div> : null}
    </div>
  );
}
