"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function formatDisplay(iso: string | null): string {
  if (!iso) return "Not set";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const btn: React.CSSProperties = {
  fontSize: 10,
  padding: "2px 8px",
  borderRadius: 3,
  border: "0.5px solid var(--border-lo)",
  background: "#fff",
  cursor: "pointer",
};

export default function ActualCompletionDate({
  projectId,
  initial,
}: {
  projectId: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/rehab/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualEndDate: value || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "Failed to save");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: initial ? "inherit" : "var(--text-tertiary)" }}>
          {formatDisplay(initial)}
        </span>
        <button
          type="button"
          onClick={() => {
            setValue(initial ?? "");
            setError(null);
            setEditing(true);
          }}
          aria-label="Edit actual completion date"
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: 0,
            color: "var(--blue)",
            fontSize: 11,
            lineHeight: 1,
          }}
        >
          ✎
        </button>
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        justifyContent: "flex-end",
      }}
    >
      <input
        type="date"
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        style={{
          fontSize: 11,
          padding: "2px 4px",
          border: "0.5px solid var(--border-lo)",
          borderRadius: 3,
        }}
      />
      <button type="button" onClick={save} disabled={saving} style={{ ...btn, color: "var(--blue)" }}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
        disabled={saving}
        style={btn}
      >
        Cancel
      </button>
      {error && <span style={{ color: "var(--red-txt)", fontSize: 10 }}>{error}</span>}
    </span>
  );
}
