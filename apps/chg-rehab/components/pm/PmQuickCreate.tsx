"use client";

import React from "react";

interface PmQuickCreateProps {
  listId: string;
  statusId?: string;
  defaultStatus?: any;
  onCreated: (task: any) => void;
  onCancel: () => void;
}

export default function PmQuickCreate({ listId, statusId, onCreated, onCancel }: PmQuickCreateProps) {
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pm/lists/${listId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), statusId }),
      });
      const data = await res.json();
      if (data.task) {
        onCreated(data.task);
        setName("");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      autoFocus
      placeholder="Task name… (Enter to save)"
      value={name}
      disabled={saving}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => { if (!name.trim()) onCancel(); }}
      style={{
        width: "100%",
        fontSize: 12,
        padding: "7px 10px",
        border: "1px solid #3B82F6",
        borderRadius: 4,
        outline: "none",
        boxSizing: "border-box",
        background: "#fff",
      }}
    />
  );
}
