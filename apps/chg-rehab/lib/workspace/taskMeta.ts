// Shared task metadata + helpers for the /workspace/tasks UI.
// Client-importable: keep free of server-only imports.

export type WsStatus = "NotStarted" | "InProgress" | "InReview" | "Done" | "Cancelled";

export const STATUS_ORDER: WsStatus[] = ["NotStarted", "InProgress", "InReview", "Done", "Cancelled"];

export const STATUS_META: Record<WsStatus, { label: string; color: string }> = {
  NotStarted: { label: "Not Started", color: "#94a3b8" },
  InProgress: { label: "In Progress", color: "#3b82f6" },
  InReview: { label: "In Review", color: "#f59e0b" },
  Done: { label: "Done", color: "#22c55e" },
  Cancelled: { label: "Cancelled", color: "#ef4444" },
};

export type Priority = "Urgent" | "High" | "Medium" | "Low";

export const PRIORITY_ORDER: Priority[] = ["Urgent", "High", "Medium", "Low"];

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  Urgent: { label: "Urgent", color: "#ef4444" },
  High: { label: "High", color: "#f97316" },
  Medium: { label: "Medium", color: "#eab308" },
  Low: { label: "Low", color: "#94a3b8" },
};

export type TaskAssignee = { user: { id: string; name: string; initials: string; avatarUrl: string | null } };
export type TaskSpace = { id: string; name: string; color: string | null };

export type WsTaskDTO = {
  id: string;
  title: string;
  priority: string;
  status: WsStatus;
  isPrivate: boolean;
  dueDate: string | null;
  done: boolean;
  linkLabel: string | null;
  space: TaskSpace | null;
  assignees: TaskAssignee[];
  assignee: { id: string; name: string; initials: string } | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
};

export type TeamMember = { id: string; name: string; initials: string; email: string | null };

export const DEFAULT_SPACE_COLOR = "#1F4D5C";

export function statusMeta(s: string) {
  return STATUS_META[s as WsStatus] ?? STATUS_META.NotStarted;
}
export function priorityMeta(p: string) {
  return PRIORITY_META[p as Priority] ?? PRIORITY_META.Medium;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function isOverdue(iso: string | null, status: string): boolean {
  if (!iso) return false;
  if (status === "Done" || status === "Cancelled") return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// Translucent tint of a hex color, for row backgrounds / pills.
export function tint(hex: string | null, alpha: number): string {
  const h = (hex ?? DEFAULT_SPACE_COLOR).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(31,77,92,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Deterministic avatar background from a user id, for visual variety.
const AVATAR_PALETTE = ["#1F4D5C", "#6d28d9", "#be123c", "#0f766e", "#b45309", "#1d4ed8", "#a21caf", "#15803d"];
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
