"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const COLORS = ["#1F4D5C", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#6B7280"];

export default function PmCreateSpace({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/pm/spaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, color }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Failed to create space");
      onClose();
      router.push(`/pm/${d.id}`);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.35)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div style={{ width: 380, background: "var(--bg-primary)", borderRadius: 12, boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "0.5px solid var(--border-lo)", fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
          New Space
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="e.g. Acquisitions"
              style={{ width: "100%", padding: "8px 10px", fontSize: 13, fontFamily: "inherit", border: "1px solid var(--border-mid)", borderRadius: 6, outline: "none", color: "var(--text-primary)", background: "var(--bg-primary)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 8 }}>Color</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: color === c ? "2px solid var(--text-primary)" : "2px solid transparent", cursor: "pointer" }}
                />
              ))}
            </div>
          </div>
          {err ? <div style={{ fontSize: 12, color: "var(--danger)" }}>{err}</div> : null}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "0.5px solid var(--border-lo)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} style={btnPrimary}>{busy ? "Creating…" : "Create"}</button>
        </div>
      </div>
    </div>
  );
}

const btnGhost: React.CSSProperties = { padding: "7px 14px", fontSize: 13, fontFamily: "inherit", background: "transparent", border: "1px solid var(--border-mid)", borderRadius: 6, cursor: "pointer", color: "var(--text-secondary)" };
const btnPrimary: React.CSSProperties = { padding: "7px 14px", fontSize: 13, fontFamily: "inherit", background: "var(--marine)", border: "1px solid var(--marine)", borderRadius: 6, cursor: "pointer", color: "#fff" };
