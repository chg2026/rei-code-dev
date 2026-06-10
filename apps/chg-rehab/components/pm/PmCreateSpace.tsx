"use client";

import React from "react";
import { useRouter } from "next/navigation";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#1F4D5C", "#6B7280"];
const MARINE = "#1F4D5C";

interface PmCreateSpaceProps {
  onClose: () => void;
}

export default function PmCreateSpace({ onClose }: PmCreateSpaceProps) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#3B82F6");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/pm/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create space"); return; }
      onClose();
      router.push(`/pm/${data.space.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#fff", borderRadius: 10, padding: 24, width: 360,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#111827" }}>New Space</h2>
        <form onSubmit={submit}>
          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Development, Marketing…"
              style={{ width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: 6, border: "1px solid #D1D5DB", boxSizing: "border-box" }}
            />
          </label>

          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Color</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 24, height: 24, borderRadius: "50%", background: c, border: "none",
                    cursor: "pointer", outline: color === c ? `3px solid ${c}` : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p style={{ color: "#EF4444", fontSize: 12, margin: "0 0 12px" }}>{error}</p>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{ fontSize: 13, padding: "7px 14px", background: "none", border: "1px solid #D1D5DB", borderRadius: 6, cursor: "pointer", color: "#374151" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ fontSize: 13, fontWeight: 600, padding: "7px 16px", background: MARINE, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
            >
              {saving ? "Creating…" : "Create Space"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
