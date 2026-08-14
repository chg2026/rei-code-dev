"use client";

import { useState } from "react";

type AgreementRef = { id: string; name: string; contact: { id: string; name: string } };

export function ConvertToVisitModal({
  reportId,
  propertyId,
  description,
  agreements,
  onClose,
  onSuccess,
}: {
  reportId: string;
  propertyId: string;
  description: string;
  agreements: AgreementRef[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [agreementId, setAgreementId] = useState(agreements[0]?.id || "");
  const [visitedAt, setVisitedAt] = useState(new Date().toISOString().split("T")[0]);
  const [tripNumber, setTripNumber] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreementId || !propertyId) {
      setError("Select an agreement.");
      return;
    }
    setBusy(true);
    setError("");

    const selected = agreements.find((a) => a.id === agreementId);

    const res = await fetch("/api/maintenance/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId,
        agreementId,
        contactId: selected?.contact.id,
        reportId,
        visitedAt,
        tripNumber,
        description: description || null,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to create visit");
      setBusy(false);
      return;
    }

    onSuccess();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "rgba(18,18,22,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          padding: "28px",
          width: "100%",
          maxWidth: 440,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>
          Convert Report to Visit
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500, color: "var(--stone)" }}>
              Agreement
            </label>
            <select
              value={agreementId}
              onChange={(e) => setAgreementId(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-1)",
                background: "rgba(255,255,255,0.06)",
                color: "var(--ink)",
                fontSize: 14,
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            >
              {agreements.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.contact.name})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500, color: "var(--stone)" }}>
                Visit Date
              </label>
              <input
                type="date"
                value={visitedAt}
                onChange={(e) => setVisitedAt(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-1)",
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--ink)",
                  fontSize: 14,
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500, color: "var(--stone)" }}>
                Trip #
              </label>
              <input
                type="number"
                min={1}
                value={tripNumber}
                onChange={(e) => setTripNumber(Number(e.target.value))}
                required
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-1)",
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--ink)",
                  fontSize: 14,
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {error && (
            <p style={{ color: "var(--red)", fontSize: 13, margin: "0 0 12px" }}>{error}</p>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "9px 18px",
                borderRadius: 10,
                border: "1px solid var(--border-1)",
                background: "transparent",
                color: "var(--stone)",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !agreementId}
              style={{
                padding: "9px 18px",
                borderRadius: 10,
                border: "none",
                background: busy ? "var(--border-1)" : "var(--blue)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 500,
                cursor: busy ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? "Creating…" : "Create Visit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
