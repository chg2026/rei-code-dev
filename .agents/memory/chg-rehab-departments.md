---
name: CHG Company Departments == PmSpace
description: UI "Company Departments" maps to the PmSpace model and /pm route.
---

The user-facing "Company Departments" feature is the renamed Project Manager:
- Model/route are unchanged — it is the `PmSpace` model and the `/pm` route. UI
  strings say "Company Departments"/"Department" but code/DB still say PmSpace/pm.
- Space (Department) create/rename/delete is admin-only: API `POST /api/pm/spaces`
  + `PATCH/DELETE /api/pm/spaces/[spaceId]` return 403 for role !== "Admin".
  List creation under a space is intentionally NOT locked.
- WsTask has a nullable `spaceId` FK to PmSpace (onDelete SetNull). Department is
  REQUIRED in the manual task-create forms (TaskDetailPanel create mode,
  CreateTaskModal) but OPTIONAL at `POST /api/workspace/tasks` on purpose — subtask
  creation and message->task conversion create WsTasks without a department.
  **Why:** keep those non-form flows working while still forcing a department on
  human-created top-level tasks.
