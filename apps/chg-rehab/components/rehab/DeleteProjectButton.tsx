"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function DeleteProjectButton({
  projectCode,
  projectName,
}: {
  projectCode: string;
  projectName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    const ok = window.confirm(
      `Delete project "${projectName}" (${projectCode})?\n\nThis permanently removes the project and all of its phases, draws, SOW, and documents. This cannot be undone.`
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/rehab/${encodeURIComponent(projectCode)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Failed (${res.status})`);
        }
        router.push("/rehab");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete project");
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {error && <span style={{ fontSize: 10, color: "var(--red-txt, #b42318)" }}>{error}</span>}
      <button
        type="button"
        className="btn"
        onClick={onDelete}
        disabled={pending}
        title="Delete this project"
        style={{ color: "var(--red-txt, #b42318)", borderColor: "var(--border-lo)" }}
      >
        {pending ? "Deleting…" : "Delete project"}
      </button>
    </span>
  );
}
