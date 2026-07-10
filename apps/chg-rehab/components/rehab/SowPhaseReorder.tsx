"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Up/down reorder controls for a SOW job-type row. Moving a row swaps it with
 * its neighbor and persists the whole new order via the reorder route, which
 * rewrites `sortOrder` only — cost codes (`number`) never change.
 */
export default function SowPhaseReorder({
  projectCode,
  orderedIds,
  index,
}: {
  projectCode: string;
  orderedIds: string[];
  index: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const move = (dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= orderedIds.length) return;
    const next = orderedIds.slice();
    [next[index], next[target]] = [next[target], next[index]];
    startTransition(async () => {
      await fetch(`/api/rehab/${encodeURIComponent(projectCode)}/phases/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phaseIds: next }),
      }).catch(() => undefined);
      router.refresh();
    });
  };

  const btn: React.CSSProperties = {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 10,
    lineHeight: 1,
    color: "var(--text-tertiary)",
    padding: "1px 3px",
  };

  return (
    <span
      style={{ display: "inline-flex", flexDirection: "column", marginRight: 2 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Move up"
        title="Move up"
        style={{ ...btn, opacity: index === 0 || pending ? 0.3 : 1 }}
        disabled={index === 0 || pending}
        onClick={() => move(-1)}
      >
        ▲
      </button>
      <button
        type="button"
        aria-label="Move down"
        title="Move down"
        style={{ ...btn, opacity: index === orderedIds.length - 1 || pending ? 0.3 : 1 }}
        disabled={index === orderedIds.length - 1 || pending}
        onClick={() => move(1)}
      >
        ▼
      </button>
    </span>
  );
}
