"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type PropertyRef = { id: string; code: string; address: string };
type AgreementRef = { id: string; name: string; contact: { id: string; name: string } };
type ReportRef = { id: string; propertyId: string; description: string; property: PropertyRef } | null;

type WorkItemInput = { description: string; category: string; laborCost: string; materialCost: string };

export function NewVisitClient({
  properties,
  agreements,
  report,
}: {
  properties: PropertyRef[];
  agreements: AgreementRef[];
  report: ReportRef;
}) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(report?.propertyId || "");
  const [agreementId, setAgreementId] = useState(agreements[0]?.id || "");
  const [contactId, setContactId] = useState("");
  const [visitedAt, setVisitedAt] = useState(new Date().toISOString().split("T")[0]);
  const [tripNumber, setTripNumber] = useState(1);
  const [description, setDescription] = useState(report?.description || "");
  const [isRepeatFix, setIsRepeatFix] = useState(false);
  const [workItems, setWorkItems] = useState<WorkItemInput[]>([
    { description: "", category: "Repair", laborCost: "", materialCost: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Auto-select contact when agreement changes
  useEffect(() => {
    const a = agreements.find((a) => a.id === agreementId);
    if (a) setContactId(a.contact.id);
  }, [agreementId, agreements]);

  const addWorkItem = () => {
    setWorkItems([...workItems, { description: "", category: "Repair", laborCost: "", materialCost: "" }]);
  };

  const updateWorkItem = (i: number, field: keyof WorkItemInput, value: string) => {
    const updated = [...workItems];
    updated[i] = { ...updated[i], [field]: value };
    setWorkItems(updated);
  };

  const removeWorkItem = (i: number) => {
    if (workItems.length === 1) return;
    setWorkItems(workItems.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !agreementId || !visitedAt) {
      setError("Property, agreement, and date are required.");
      return;
    }
    setBusy(true);
    setError("");

    const res = await fetch("/api/maintenance/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId,
        agreementId,
        contactId,
        reportId: report?.id || null,
        visitedAt,
        tripNumber,
        description: description.trim() || null,
        isRepeatFix,
        workItems: workItems
          .filter((wi) => wi.description.trim())
          .map((wi) => ({
            description: wi.description.trim(),
            category: wi.category,
            laborCost: wi.laborCost ? Number(wi.laborCost) : null,
            materialCost: wi.materialCost ? Number(wi.materialCost) : null,
          })),
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to create visit");
      setBusy(false);
      return;
    }

    router.push("/maintenance");
    router.refresh();
  };

  const labelStyle: React.CSSProperties = { display: "block", marginBottom: 5, fontSize: 13, fontWeight: 500, color: "var(--stone)" };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)",
    background: "rgba(255,255,255,0.06)", color: "var(--ink)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 24px" }}>Log Maintenance Visit</h1>
      {report && (
        <div style={{ background: "rgba(37,99,235,0.08)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--blue)" }}>
          Creating from report: {report.property.code} — {report.description.slice(0, 100)}{report.description.length > 100 ? "…" : ""}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 16, border: "1px solid var(--border-1)", padding: 24 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Property *</label>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required style={inputStyle}>
              <option value="">Select…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.address}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Agreement *</label>
            <select value={agreementId} onChange={(e) => setAgreementId(e.target.value)} required style={inputStyle}>
              {agreements.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.contact.name})</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Date *</label>
            <input type="date" value={visitedAt} onChange={(e) => setVisitedAt(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Trip #</label>
            <input type="number" min={1} value={tripNumber} onChange={(e) => setTripNumber(Number(e.target.value))} required style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What was done overall…" style={{ ...inputStyle, resize: "vertical" }} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={isRepeatFix} onChange={(e) => setIsRepeatFix(e.target.checked)} />
            This is a repeat fix (same issue, $150 cap applies)
          </label>
        </div>

        {/* Work Items */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Work Items</span>
            <button type="button" onClick={addWorkItem} style={{ padding: "4px 12px", borderRadius: 8, border: "1px solid var(--border-1)", background: "transparent", color: "var(--blue)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ Add Item</button>
          </div>

          {workItems.map((wi, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, marginBottom: 8, border: "1px solid var(--border-1)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="What was done? (e.g. Replaced kitchen faucet)"
                  value={wi.description}
                  onChange={(e) => updateWorkItem(i, "description", e.target.value)}
                  style={{ ...inputStyle, fontSize: 13 }}
                />
                <select value={wi.category} onChange={(e) => updateWorkItem(i, "category", e.target.value)} style={{ ...inputStyle, width: 120, fontSize: 13 }}>
                  <option value="Repair">Repair</option>
                  <option value="Replace">Replace</option>
                  <option value="Inspect">Inspect</option>
                  <option value="Purchase">Purchase</option>
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--stone)" }}>Labor $</label>
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={wi.laborCost} onChange={(e) => updateWorkItem(i, "laborCost", e.target.value)} style={{ ...inputStyle, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--stone)" }}>Materials $</label>
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={wi.materialCost} onChange={(e) => updateWorkItem(i, "materialCost", e.target.value)} style={{ ...inputStyle, fontSize: 13 }} />
                </div>
                {workItems.length > 1 && (
                  <button type="button" onClick={() => removeWorkItem(i)} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "rgba(220,38,38,0.10)", color: "var(--red)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginTop: 16 }}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "0 0 16px" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => router.back()} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid var(--border-1)", background: "transparent", color: "var(--stone)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button type="submit" disabled={busy} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: busy ? "var(--border-1)" : "var(--blue)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{busy ? "Saving…" : "Log Visit"}</button>
        </div>
      </form>
    </div>
  );
}
