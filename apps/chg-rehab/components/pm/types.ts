export type PmStatus = {
  id: string;
  name: string;
  color: string;
  type: string;
  order?: number;
  isDefault?: boolean;
};

export type PmAssignee = { id: string; name: string; initials: string };

export type PmTag = { id: string; name: string; color: string; textColor: string };

export type PmTaskRow = {
  id: string;
  name: string;
  taskType: string;
  priority: string | null;
  statusId: string | null;
  status: PmStatus | null;
  parentTaskId: string | null;
  startDate: string | null;
  dueDate: string | null;
  doneDate: string | null;
  subtaskCount: number;
  assignees: PmAssignee[];
};

export type PmListLite = { id: string; name: string; color: string | null; order: number };

export type PmSpaceWithLists = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  lists: PmListLite[];
  _count?: { lists: number };
};

export const PRIORITIES = ["urgent", "high", "normal", "low"] as const;

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#C81E1E",
  high: "#B8895A",
  normal: "#1F4D5C",
  low: "#A8A49C",
};
