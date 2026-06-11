---
name: WsTask subtasks model
description: How WsTask parent/subtask self-relation must behave across list/delete endpoints
---

WsTask self-references via `parentTaskId` ("WsSubtasks" relation). Subtasks are
children of a parent task, edited only inside TaskDetailPanel.

**Rule:** Any top-level WsTask list query must filter `parentTaskId: null`, or
subtasks leak into the main workspace feed as peer tasks.

**Rule:** Deleting a parent must `deleteMany({ parentTaskId: id })` first (company-scoped).
The FK is `onDelete: SetNull`, so without an explicit cascade a deleted parent
silently promotes its subtasks to standalone top-level tasks.

**Why:** Both behaviors were caught in review — SetNull + unfiltered list =
orphaned subtasks showing up as duplicates.

**How to apply:** When adding new endpoints that list or delete WsTask rows,
honor both rules. Per-task activity (WsTaskActivity) logs created/completed/
assigned/due_date_set/commented; only log "assigned" on a real assignee change.
