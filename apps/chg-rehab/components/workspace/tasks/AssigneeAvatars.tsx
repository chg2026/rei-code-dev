"use client";

import { avatarColor, type TaskAssignee } from "@/lib/workspace/taskMeta";

export default function AssigneeAvatars({
  assignees,
  max = 3,
  size = 24,
}: {
  assignees: TaskAssignee[];
  max?: number;
  size?: number;
}) {
  if (!assignees.length) return null;
  const shown = assignees.slice(0, max);
  const overflow = assignees.length - shown.length;
  const fontSize = Math.round(size * 0.42);

  return (
    <div style={{ display: "inline-flex", alignItems: "center" }}>
      {shown.map((a, i) => (
        <span
          key={a.user.id}
          title={a.user.name}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: avatarColor(a.user.id),
            color: "#fff",
            fontSize,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--surface, #fff)",
            marginLeft: i === 0 ? 0 : -size * 0.33,
            flexShrink: 0,
          }}
        >
          {a.user.initials}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          title={assignees.slice(max).map((a) => a.user.name).join(", ")}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: "var(--border-2, #DCD9D2)",
            color: "var(--slate, #2A2826)",
            fontSize,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--surface, #fff)",
            marginLeft: -size * 0.33,
            flexShrink: 0,
          }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
