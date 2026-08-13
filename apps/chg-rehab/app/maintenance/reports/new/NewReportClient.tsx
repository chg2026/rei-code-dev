"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PropertyRef = { id: string; code: string; address: string };

export function NewReportClient({ properties }: { properties: PropertyRef[] }) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !description.trim()) {
      setError("Property and description are required.");
      return;
    }
    setBusy(true);
    setError("");

    const res = await fetch("/api/maintenance/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId,
        reportedBy: reportedBy.trim() || null,
        description: description.trim(),
        priority,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to create report");
      setBusy(false);
      return;
    }

    router.push("/maintenance/reports");
    router.refresh();
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 24px" }}>New Maintenance Report</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: 16,
          border: "1px solid var(--border-1)",
          padding: 24,
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Property *</label>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            required
            style={inputStyle}
          >
            <option value="">Select a property…</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.address}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Reported By</label>
          <input
            type="text"
            value={reportedBy}
            onChange={(e) => setReportedBy(e.target.value)}
            placeholder="Tenant name, property manager, etc."
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Description *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's the issue? Be specific…"
            rows={4}
            required
            style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Priority</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["Emergency", "High", "Medium", "Low"].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 10,
                  border: priority === p ? "2px solid var(--blue)" : "1px solid var(--border-1)",
                  background: priority === p ? "rgba(37,99,235,0.10)" : "transparent",
                  color: "var(--ink)",
                  fontSize: 13,
                  fontWeight: priority === p ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "0 0 16px" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              padding: "10px 20px",
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
            disabled={busy}
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              border: "none",
              background: busy ? "var(--border-1)" : "var(--blue)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {busy ? "Saving…" : "Save Report"}
          </button>
        </div>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 500,
  color: "var(--stone)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--border-1)",
  background: "rgba(255,255,255,0.06)",
  color: "var(--ink)",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};
