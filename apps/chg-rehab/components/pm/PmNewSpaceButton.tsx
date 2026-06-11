"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PmNewSpaceButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const createSpace = async () => {
    const name = window.prompt("New space name");
    if (!name || !name.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/pm/spaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d?.id) {
          router.push(`/pm/${d.id}`);
          return;
        }
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={createSpace}
      disabled={busy}
      style={{
        background: "#1a1a1a", color: "#fff", border: "none", cursor: "pointer",
        fontSize: 13, fontWeight: 600, padding: "9px 16px", borderRadius: 8,
        opacity: busy ? 0.6 : 1,
      }}
    >
      + New Space
    </button>
  );
}
