---
name: WsTask multi-assignee + status dual-write
description: Why WsTask keeps legacy assigneeId/done alongside the new junction + status enum, and the invariants that must hold.
---

WsTask carries BOTH the new model (WsTaskAssignee junction, WsTaskStatus enum,
isPrivate) AND the legacy single `assigneeId` + boolean `done` columns.

**Why:** older surfaces (TodoTab checkbox, calendar, property/linkType task
tabs, notification logic) still read `assigneeId`/`done`. Dropping them would
break those callers, so the columns are kept and written in lockstep.

**Invariants to preserve on every write:**
- `done` ⇔ `status === 'Done'`. Set both together. When a legacy `done:false`
  arrives, only downgrade status to NotStarted if it was Done (don't clobber
  InProgress/InReview).
- legacy `assigneeId` = first id of the new assignee set (keep them consistent).
- Private tasks (`isPrivate=true`) NEVER carry a department (`spaceId`). Enforce
  server-side on the final computed value, not just when the caller flips the
  flag — a caller can send a spaceId while the task stays private.

**How to apply:** any new endpoint/migration touching WsTask status, completion,
assignment, or privacy must update the paired legacy column and honor the
private⇒no-department rule. The /api/workspace/tasks routes already do this.
