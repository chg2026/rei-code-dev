"use client";

import { priorityMeta } from "@/lib/workspace/taskMeta";

export default function PriorityFlag({ priority, size = 14 }: { priority: string; size?: number }) {
  const meta = priorityMeta(priority);
  return (
    <span title={`${meta.label} priority`} style={{ display: "inline-flex", alignItems: "center" }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 21V4M5 4l9 3-2 4 6 2-13 4"
          stroke={meta.color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={meta.color}
          fillOpacity={0.18}
        />
      </svg>
    </span>
  );
}
