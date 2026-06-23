"use client";

import { useEffect, useRef, useState } from "react";

export type DepartmentOption = { id: string; name: string; color: string | null };

/**
 * Custom department picker that renders a colored dot next to each option —
 * native <select> can't color individual options, so this is a lightweight
 * button + popover. Used by the task create modal and the task detail panel.
 */
export default function DepartmentSelect({
  spaces,
  value,
  onChange,
  placeholder = "Select a department…",
  invalid = false,
  disabled = false,
}: {
  spaces: DepartmentOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = spaces.find((s) => s.id === value) ?? null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          fontSize: 13,
          textAlign: "left",
          background: disabled ? "var(--mist, #f3f4f6)" : "#fff",
          border: `1px solid ${invalid ? "var(--danger, #dc2626)" : "var(--border-mid, #d0d4d9)"}`,
          borderRadius: 6,
          cursor: disabled ? "not-allowed" : "pointer",
          color: selected ? "var(--ink, #111)" : "var(--quill, #888)",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <span style={dotStyle(selected.color)} />
            <span style={{ flex: 1 }}>{selected.name}</span>
          </>
        ) : (
          <span style={{ flex: 1 }}>{placeholder}</span>
        )}
        <span style={{ color: "var(--quill, #888)", fontSize: 10 }}>▾</span>
      </button>
      {open && !disabled ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            width: "100%",
            maxHeight: 240,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid var(--border-mid, #d0d4d9)",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 60,
          }}
        >
          {spaces.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--quill, #888)" }}>
              No departments yet.
            </div>
          ) : (
            spaces.map((sp) => (
              <button
                key={sp.id}
                type="button"
                role="option"
                aria-selected={sp.id === value}
                onClick={() => { onChange(sp.id); setOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: 13,
                  textAlign: "left",
                  background: sp.id === value ? "#f0f7ff" : "#fff",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ink, #111)",
                }}
              >
                <span style={dotStyle(sp.color)} />
                <span style={{ flex: 1 }}>{sp.name}</span>
                {sp.id === value ? <span style={{ color: "var(--marine, #2563eb)" }}>✓</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function dotStyle(color: string | null): React.CSSProperties {
  return {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
    background: color ?? "#6366f1",
    display: "inline-block",
  };
}
