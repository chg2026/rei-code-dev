---
name: Approval-folds-into-derived-total fields reconcile via deltas (do not re-lock)
description: Rehab Change Orders fold their amount into Phase.budget while Approved; post-approval edits/moves/deletes are supported via delta reconciliation inside one transaction — the source fields are intentionally NOT locked.
---

Rehab Change Orders apply their `amount` to the linked `Phase.budget` only
while `status = Approved` (Pending/Rejected COs have no budget effect).

**Invariant:** `Phase.budget` always equals the phase's original budget plus
the sum of that phase's Approved change-order amounts.

**Post-approval edits ARE allowed.** Earlier this feature *locked* an approved
CO's financial fields (409 in the API, disabled inputs in the UI) because the
one-time fold could otherwise desync the derived total. That lock was replaced
with **delta reconciliation** so the amount, linked job type, status, and
deletion are all editable while the invariant still holds exactly. Do NOT
re-introduce the lock.

**How it's maintained** — every mutation reverses the CO's *old* budget effect
and applies its *new* one inside a single `prisma.$transaction`
(`app/api/rehab/[projectId]/change-orders/[coId]/route.ts`):

- Edit amount A→B (still Approved, same phase): `Phase.budget += (B − A)`.
- Move Approved CO to another job type: old phase `−= A`, new phase `+= B`.
- Delete Approved CO (amount A): `Phase.budget −= A`, then delete the row.
- Approved → Pending/Rejected: `Phase.budget −= A` (un-fold; also clears the
  approver stamp so a later re-approval re-stamps).
- Pending/Rejected → Approved: `Phase.budget += A` (fold — the original
  one-time behavior; the delta map only fires the increment once, so it never
  double-adds).

The PATCH route computes this as a `phaseId → Decimal delta` map: subtract
`co.amount` from the old effective phase (if the CO *was* Approved) and add the
next amount to the new effective phase (if it *will be* Approved). This one map
covers every case above, including cross-phase moves, with no double-count.

**Why deltas over locking:** the product needs post-approval corrections
(wrong amount, wrong job type, reversed approvals). Full delta reconciliation
in one transaction keeps `Phase.budget` correct without freezing the record.
Keep all budget writes inside the `$transaction` and keep the "fold fires only
on the transition into Approved" guard intact.
