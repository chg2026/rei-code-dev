-- Data migration: copy every ProjectAddendum into a ChangeOrder (Phase 5
-- consolidation — ChangeOrder becomes the single "change" object).
--
--   * id            = 'mig_' || addendum id (deterministic → idempotent via NOT EXISTS)
--   * phaseId       = NULL (project-level)
--   * amount        = COALESCE(delta, 0)
--   * daysDelta     = addendum daysDelta
--   * number        = next sequential per project (MAX existing + row_number)
--   * status        = Approved→Approved, Rejected→Rejected, else Pending
--
-- ProjectAddendum rows are intentionally NOT deleted — they remain as backup;
-- the app simply stops reading them.
INSERT INTO "ChangeOrder"
  ("id", "projectId", "phaseId", "number", "title", "reason", "amount",
   "status", "daysDelta", "approvedById", "approvedAt", "createdAt", "updatedAt")
SELECT
  'mig_' || pa."id",
  pa."projectId",
  NULL,
  COALESCE((SELECT MAX(co."number") FROM "ChangeOrder" co WHERE co."projectId" = pa."projectId"), 0)
    + ROW_NUMBER() OVER (PARTITION BY pa."projectId" ORDER BY pa."createdAt", pa."id"),
  pa."title",
  pa."reason",
  COALESCE(pa."delta", 0),
  CASE pa."status"
    WHEN 'Approved' THEN 'Approved'::"ChangeOrderStatus"
    WHEN 'Rejected' THEN 'Rejected'::"ChangeOrderStatus"
    ELSE 'Pending'::"ChangeOrderStatus"
  END,
  pa."daysDelta",
  NULL,
  CASE WHEN pa."status" = 'Approved' THEN pa."createdAt" ELSE NULL END,
  pa."createdAt",
  CURRENT_TIMESTAMP
FROM "ProjectAddendum" pa
WHERE NOT EXISTS (
  SELECT 1 FROM "ChangeOrder" c2 WHERE c2."id" = 'mig_' || pa."id"
);
