---
name: Signed object paths must be format-validated on register
description: getPrivateFile signs ANY bucket path with the service role, so endpoints that accept a client-supplied objectPath must validate it.
---

`lib/objectStorage.ts` `getPrivateFile(objectPath)` signs **any** path in the shared
Supabase bucket using the service-role key. `getUploadUrl()` mints paths as
`uploads/<uuid>`.

**Rule:** any endpoint that stores a client-supplied `objectPath` and later signs
it (attachments, etc.) must validate the path against the minted format
(`^uploads/[0-9a-fA-F-]{36}$`) before persisting it. Task/record ownership checks
are not enough — they don't prove the *file* belongs to the caller.

**Why:** without this, a client can register an arbitrary path pointing at another
feature's / tenant's object and receive a signed download URL (broken object-level
authorization). Flagged in architect review of task attachments.

**How to apply:** reject non-conforming `objectPath` with 400 in the POST handler.
A stronger design (per-user upload tokens / persisted pending-upload records) would
require changing the shared `/api/uploads/request-url` contract, so the lightweight
format check is the proportionate fix for feature work.
