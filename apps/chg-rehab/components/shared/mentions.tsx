"use client";
import React, { useRef, useState } from "react";

export type MentionMember = { id: string; name: string; initials: string };

const MENTION_RE = /@[A-Za-z][A-Za-z'’.-]*(?: [A-Za-z][A-Za-z'’.-]*)?/g;

/** Render plain comment text with @mentions highlighted in a subtle blue. */
export function renderWithMentions(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const re = new RegExp(MENTION_RE);
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <span key={key++} style={{ color: "#6366f1" }}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * Controlled single-line input that shows a @mention autocomplete dropdown.
 * Typing `@` opens a list of team members; selecting one inserts
 * `@First Last ` at the cursor. Enter submits when the dropdown is closed.
 */
export function MentionInput({
  value,
  onChange,
  onSubmit,
  members,
  placeholder,
  className,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  members: MentionMember[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(-1);
  const [hi, setHi] = useState(0);

  const matches = open
    ? members.filter((mm) => mm.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  function recompute(v: string, caret: number) {
    const upto = v.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) { setOpen(false); return; }
    const between = upto.slice(at + 1);
    if (/\s/.test(between)) { setOpen(false); return; }
    setStart(at);
    setQuery(between);
    setHi(0);
    setOpen(true);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    recompute(v, e.target.selectionStart ?? v.length);
  }

  function pick(mm: MentionMember) {
    const caret = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(caret);
    const next = `${before}@${mm.name} ${after}`;
    onChange(next);
    setOpen(false);
    const pos = before.length + mm.name.length + 2;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (open && matches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter") { e.preventDefault(); pick(matches[hi]); return; }
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit?.(); }
  }

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <input
        ref={ref}
        className={className}
        style={{ width: "100%", ...style }}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKey}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
      />
      {open && matches.length > 0 && (
        <div style={dropdownStyle}>
          {matches.map((mm, i) => (
            <button
              key={mm.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(mm); }}
              style={{ ...rowStyle, background: i === hi ? "rgba(99,102,241,0.12)" : "transparent" }}
            >
              <span style={avatarStyle}>{mm.initials}</span>
              <span style={{ flex: 1, textAlign: "left" }}>{mm.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 4px)",
  left: 0,
  right: 0,
  zIndex: 50,
  background: "#fff",
  border: "1px solid var(--border-1, #e5e7eb)",
  borderRadius: 8,
  boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
  maxHeight: 200,
  overflowY: "auto",
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  border: "none",
  cursor: "pointer",
  padding: "8px 10px",
  fontSize: 13,
  color: "var(--ink, #111827)",
};
const avatarStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: "50%",
  flexShrink: 0,
  background: "var(--border-1, #e5e7eb)",
  color: "var(--ink, #111827)",
  fontSize: 10,
  fontWeight: 600,
};
