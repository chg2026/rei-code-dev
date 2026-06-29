"use client";

import { useEffect, useRef, useState } from "react";
import { STATUS_ORDER, statusMeta, tint, type WsStatus } from "@/lib/workspace/taskMeta";

export default function StatusPill({
  value,
  onChange,
  disabled = false,
  size = "md",
}: {
  value: string;
  onChange: (s: WsStatus) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = statusMeta(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pad = size === "sm" ? "2px 8px" : "4px 10px";
  const fs = size === "sm" ? 11 : 12;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: pad,
          fontSize: fs,
          fontWeight: 600,
          lineHeight: 1.2,
          color: meta.color,
          background: tint(meta.color, 0.14),
          border: `1px solid ${tint(meta.color, 0.32)}`,
          borderRadius: 999,
          cursor: disabled ? "default" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
        {meta.label}
        {!disabled ? <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span> : null}
      </button>
      {open && !disabled ? (
        <div
          role="listbox"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            minWidth: 150,
            background: "#fff",
            border: "1px solid var(--border-2, #DCD9D2)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
            zIndex: 80,
            overflow: "hidden",
            padding: 4,
          }}
        >
          {STATUS_ORDER.map((s) => {
            const m = statusMeta(s);
            const active = s === value;
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "7px 8px",
                  fontSize: 13,
                  textAlign: "left",
                  background: active ? tint(m.color, 0.12) : "transparent",
                  border: "none",
                  borderRadius: 7,
                  cursor: "pointer",
                  color: "var(--slate, #2A2826)",
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{m.label}</span>
                {active ? <span style={{ color: m.color }}>✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
