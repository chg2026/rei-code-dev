"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ContactRef = { id: string; name: string; company: string | null; trade: string | null };

export function NewAgreementClient({ contacts }: { contacts: ContactRef[] }) {
  const router = useRouter();
  const [contactId, setContactId] = useState("");
  const [name, setName] = useState("Maintenance Retainer");
  const [retainerAmount, setRetainerAmount] = useState("500");
  const [tripsPerMonth, setTripsPerMonth] = useState(3);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId || !name.trim() || !retainerAmount || !startDate) {
      setError("Contractor, name, retainer amount, and start date are required.");
      return;
    }
    setBusy(true);
    setError("");

    const res = await fetch("/api/maintenance/agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        name: name.trim(),
        retainerAmount: Number(retainerAmount),
        tripsPerMonth,
        startDate,
        endDate: endDate || null,
        notes: notes.trim() || null,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to create agreement");
      setBusy(false);
      return;
    }

    router.push(`/maintenance/agreements/${json.agreement.id}`);
    router.refresh();
  };

  const labelStyle: React.CSSProperties = { display: "block", marginBottom: 5, fontSize: 13, fontWeight: 500, color: "var(--stone)" };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)",
    background: "rgba(255,255,255,0.06)", color: "var(--ink)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 24px" }}>New Maintenance Agreement</h1>

      <form
        onSubmit={handleSubmit}
        style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 16, border: "1px solid var(--border-1)", padding: 24 }}
      >
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Contractor *</label>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} required style={inputStyle}>
            <option value="">Select a contractor…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.company ? ` — ${c.company}` : ""}{c.trade ? ` (${c.trade})` : ""}
              </option>
            ))}
          </select>
          {contacts.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--stone)", margin: "6px 0 0" }}>
              No contractor contacts found. Add one in Contacts first (type: Contractor).
            </p>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Agreement Name *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>Retainer / Month ($) *</label>
            <input type="number" min="0" step="0.01" value={retainerAmount} onChange={(e) => setRetainerAmount(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Trips per Month *</label>
            <input type="number" min="1" value={tripsPerMonth} onChange={(e) => setTripsPerMonth(Number(e.target.value))} required style={inputStyle} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>Start Date *</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>End Date (optional)</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        </div>

        {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "0 0 16px" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => router.back()} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid var(--border-1)", background: "transparent", color: "var(--stone)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button type="submit" disabled={busy} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: busy ? "var(--border-1)" : "var(--blue)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{busy ? "Saving…" : "Save Agreement"}</button>
        </div>
      </form>
    </div>
  );
}
