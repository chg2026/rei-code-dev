---
name: Invoice stage payments
description: How CHG Rehab staged (milestone) invoice payments feed phase actuals and invoice status.
---

# Invoice stage payments (CHG Rehab)

`InvoiceStage` rows model a payment schedule on an `Invoice`. Phase actuals are
centralized in `lib/rehab/invoiceActuals.ts → computePhaseActuals(projectId)`,
used by both `recomputePhaseActuals` and the budget page so the SOW and Budget
tabs never diverge.

**Actuals rule (the decision):**
- Unstaged Paid invoice → sum its job-type amounts into each phase (legacy behavior).
- Staged invoice → only its *Paid* stages count, and that paid-stage total is
  allocated **proportionally across job types by job-type amount**, then rolled
  into each job type's phase.

**Why:** a staged invoice isn't fully spent until stages are paid; proportional
allocation keeps per-phase actuals meaningful when one invoice spans phases.

**Invoice/stage status must stay symmetric.** The stage-status PATCH
(`invoices/[invoiceId]/stages/[stageId]`) promotes the invoice to Paid when all
stages are Paid AND demotes a Paid invoice back to Pending the moment any stage
is Pending. A one-way (promote-only) cascade leaves invoices stuck Paid with
money outstanding — caught in review.

**How to apply:** any new writer of stage status or invoice status must call
`recomputePhaseActuals` for the invoice's job-type phases afterward, and keep the
two-way status sync. `prisma db push` fails here (cross-schema FK) — migrate the
table via the idempotent raw-SQL tsx script + `prisma generate`.
