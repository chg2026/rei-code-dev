"use client";

import { useState } from "react";

type Property = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  status: string | null;
};

export default function UnderwritingClient({ properties, initialAnalysisId, initialPropertyId }: { properties: Property[]; initialAnalysisId?: string | null; initialPropertyId?: string | null }) {
  const [selectedId, setSelectedId] = useState<string>(
    initialPropertyId && properties.some(p => p.id === initialPropertyId)
      ? initialPropertyId
      : (properties[0]?.id ?? "")
  );

  const selected = properties.find(p => p.id === selectedId);

  const iframeSrc = selected
    ? `/underwriting-calc.html?propertyId=${encodeURIComponent(selected.id)}&address=${encodeURIComponent(selected.address)}&city=${encodeURIComponent(selected.city ?? "")}&state=${encodeURIComponent(selected.state ?? "")}&status=${encodeURIComponent(selected.status ?? "")}${initialAnalysisId ? `&analysisId=${encodeURIComponent(initialAnalysisId)}` : ""}`
    : "/underwriting-calc.html";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>
      {/* Property selector bar */}
      <div style={{
        padding: "8px 16px",
        background: "#fff",
        borderBottom: "0.5px solid var(--border-lo, #E5E3DE)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          Analyzing:
        </span>
        {properties.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            No properties yet — <a href="/property" style={{ color: "var(--marine, #1F4D5C)" }}>add one first</a>
          </span>
        ) : (
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 6,
              border: "0.5px solid var(--border-mid, #E5E3DE)",
              background: "#fff",
              color: "var(--text-primary)",
              fontFamily: "inherit",
              minWidth: 280,
            }}
          >
            {properties.map(p => (
              <option key={p.id} value={p.id}>
                {p.address}{p.city ? `, ${p.city}` : ""}{p.state ? `, ${p.state}` : ""}
                {p.status ? ` · ${p.status}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Calculator iframe */}
      <iframe
        key={iframeSrc}
        src={iframeSrc}
        style={{
          flex: 1,
          border: "none",
          width: "100%",
          height: "100%",
          display: "block",
        }}
        title="Underwriting Calculator"
      />
    </div>
  );
}
