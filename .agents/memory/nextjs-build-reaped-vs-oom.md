---
name: Long builds reaped when backgrounded in a tool shell
description: Why `nohup npm run build &` dies silently at "Collecting page data" and what to run instead
---

A long `next build` started with `nohup ... &` inside a bash tool call dies
silently mid-run — typically stuck-looking at `Collecting page data ...` with
no error and the parent process gone. It is NOT an OOM and NOT a code hang: the
backgrounded process gets reaped when the tool-call shell session ends.

Distinguishing signs it is reaping, not a real bug:
- `Compiled successfully` + clean ESLint already printed (compile/typecheck passed).
- Last log line is `Collecting page data ...`, no stack trace, no exit code.
- `ps` shows the build PID gone while plenty of free memory remains.
- The new route/page modules have no top-level side effects (all `force-dynamic`,
  only const/regex at module scope) — so page-data collection can't hang on them.

**Why:** the sandbox terminates orphaned processes from a completed tool
invocation; `&`/`nohup` does not survive it. A synchronous `npm run build` also
fails here — it exceeds the 120s bash timeout while 5 Next dev servers run.

**How to apply:** run long builds through the managed validation runner
(validation skill: `startValidationRun({ commandIds: ["build-chg-rehab"] })`),
which runs out-of-band, isn't reaped, and returns status + a log path. That is
the reliable full-build signal in this repo; don't retry the nohup path.
