---
name: Approval-folds-into-derived-total fields must lock
description: Rehab Change Orders (and similar) fold an amount into Phase.budget on a one-time status transition; the source fields must lock after that transition.
---

When a feature applies an amount to a derived/running total exactly once on a
status transition (e.g. a Change Order folding its `amount` into the linked
`Phase.budget` the first time it becomes `Approved`), the financial source
fields (amount, linked entity, status rollback) MUST be locked after that
transition.

**Why:** The increment only fires on the first transition into the terminal
state (guarded so it never double-adds). If the record stays editable
afterward, editing the amount/linked-entity or rolling the status back never
reconciles the already-applied total, so the derived total silently drifts out
of sync with the source data. Caught in architect review of the Change Orders
tab.

**How to apply:** Mirror the "only Pending can be deleted" rule — once the
record is in the applied/approved state, reject changes to the financial fields
both in the API (compare against current values, return 409) and in the UI
(disable those inputs). Allow only non-financial edits (title, reason). The
alternative — full delta reconciliation (reverse old, apply new, handle
entity moves) in one transaction — is more code and more failure modes; prefer
locking unless the product genuinely needs post-approval edits.
