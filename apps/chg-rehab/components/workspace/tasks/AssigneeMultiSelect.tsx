"use client";

import { useEffect, useRef, useState } from "react";
import { avatarColor, type TeamMember } from "@/lib/workspace/taskMeta";

export default function AssigneeMultiSelect({
  members,
  value,
  onChange,
  placeholder = "Add people…",
}: {
  members: TeamMember[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
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

  const selected = value
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is TeamMember => Boolean(m));

  const q = query.trim().replace(/^@/, "").toLowerCase();
  const matches = members
    .filter((m) => !value.includes(m.id))
    .filter((m) => (q ? m.name.toLowerCase().includes(q) : true))
    .slice(0, 8);

  const add = (id: string) => {
    onChange([...value, id]);
    setQuery("");
  };
  const remove = (id: string) => onChange(value.filter((v) => v !== id));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
          padding: 6,
          minHeight: 40,
          background: "#fff",
          border: "1px solid var(--border-2, #DCD9D2)",
          borderRadius: 8,
        }}
        onClick={() => setOpen(true)}
      >
        {selected.map((m) => (
          <span
            key={m.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 6px 3px 3px",
              background: "var(--bone, #F5F4F0)",
              border: "1px solid var(--border-2, #DCD9D2)",
              borderRadius: 999,
              fontSize: 12,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: avatarColor(m.id),
                color: "#fff",
                fontSize: 8,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {m.initials}
            </span>
            {m.name}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(m.id);
              }}
              aria-label={`Remove ${m.name}`}
              style={{ background: "none", border: "none", color: "var(--stone, #A8A49C)", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length ? "" : placeholder}
          style={{ flex: 1, minWidth: 100, border: "none", outline: "none", fontSize: 13, background: "transparent" }}
        />
      </div>
      {open && matches.length ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            width: "100%",
            maxHeight: 240,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid var(--border-2, #DCD9D2)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
            zIndex: 80,
            padding: 4,
          }}
        >
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => add(m.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "7px 8px",
                fontSize: 13,
                textAlign: "left",
                background: "transparent",
                border: "none",
                borderRadius: 7,
                cursor: "pointer",
                color: "var(--slate, #2A2826)",
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: avatarColor(m.id),
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {m.initials}
              </span>
              {m.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
