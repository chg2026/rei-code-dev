---
name: Attachment objectPath IDOR
description: Why attachment-register routes must validate the minted objectPath shape before persisting/signing
---

Any route that accepts a client-supplied `objectPath` to register an attachment and
later signs it (via `getPrivateFile` / Supabase service-role signer) MUST validate
that the path matches the server-minted format before storing it.

`getUploadUrl()` in `lib/objectStorage.ts` always mints `uploads/<uuid>`. Register
routes should reject anything else, e.g.
`/^uploads\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/`.

**Why:** Without this, a caller can register an arbitrary path (another tenant's
object) and then fetch a valid signed download URL for it — broken object-level
authorization (IDOR). Flagged in review of the Rehab Invoices attachments route.

**How to apply:** Whenever you add an attachment/upload-register endpoint (invoices,
tasks, docs, etc.), validate the objectPath format on POST in addition to the usual
auth + tenant scoping. Presence-only checks are not enough.
