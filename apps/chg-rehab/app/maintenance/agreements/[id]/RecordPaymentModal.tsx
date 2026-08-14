"use client";

import { useState } from "react";

export function RecordPaymentModal({
  agreementId,
  onClose,
  onSuccess,
}: {
  agreementId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const now = new Date();
  const [amount, setAmount] = useState("500");
  const [paidAt, setPaidAt] = useState(now.toISOString().split("T")[0]);
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !paidAt || !period) {
      setError("Amount, date, and period are required.");
      return;
    }
    setBusy(true);
    setError("");

    const res = await fetch("/api/maintenance/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agreementId,
        amount: Number(amount),
        paidAt,
        period: period.trim(),
        notes: notes.trim() || null,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to record payment");
      setBusy(false);
      return;
    }

    onSuccess();
  };

  const labelStyle: React.CSSProperties = { display: "block", marginBottom: 5, fontSize: 13, fontWeight: 500, color: "var(--stone)" };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)",
    background: "rgba(255,255,255,0.06)", color: "var(--ink)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "rgba(18,18,22,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRadius: 18, border: "1px solid rgba(255,255,255,0.10)", padding: "28px", width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>Record Payment</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Amount ($) *</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Date Paid *</label>
              <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Period *</label>
              <input type="text" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-08" required style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. August retainer" style={inputStyle} />
          </div>

          {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "0 0 16px" }}>{error}</p>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--border-1)", background: "transparent", color: "var(--stone)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: busy ? "var(--border-1)" : "var(--blue)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{busy ? "Saving…" : "Save Payment"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
