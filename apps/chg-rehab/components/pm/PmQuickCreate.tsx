"use client";

import { useState } from "react";

export default function PmQuickCreate({
  listId,
  statusId,
  defaultStatus,
  onCreated,
  onCancel,
}: {
  listId: string;
  statusId?: string | null;
  defaultStatus?: string | null;
  onCreated: () => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/pm/lists/${listId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, statusId: statusId ?? defaultStatus ?? undefined }),
      });
      setValue("");
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <input
      autoFocus
      disabled={busy}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          setValue("");
          onCancel?.();
        }
      }}
      onBlur={() => {
        if (!value.trim()) onCancel?.();
      }}
      placeholder="Task name, press Enter to add…"
      style={{
        width: "100%",
        padding: "7px 10px",
        fontSize: 13,
        fontFamily: "inherit",
        color: "var(--text-primary)",
        background: "var(--bg-primary)",
        border: "1px solid var(--marine)",
        borderRadius: 6,
        outline: "none",
      }}
    />
  );
}
