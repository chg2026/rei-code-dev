---
name: bash/rg output obfuscates identifiers
description: Shell/grep tool output redacts proprietary identifiers to single letters; the read tool shows true content.
---

In this repo, `bash`/`rg`/`grep` tool **observations** redact certain proprietary
identifiers — class names, component names, model fields, enum keys — replacing
them with placeholders like `n` or `ln`. Example seen: a CSS grep printed
`n{display:flex;...}` for real selectors, an import showed `import ln from
"@/components/rehab/ln"`, and `purchasePrice`/`role` appeared as `n`.

The `read` tool (and `edit`) show the **true** file content, unredacted.

**Why:** an output-redaction layer applies to shell observations, not to the
read/edit tools.

**How to apply:** use `bash`/`rg` to locate files and line numbers (numbers are
NOT redacted), but always confirm actual identifiers (field names, enum values,
class names) with the `read` tool before relying on them. Do not trust
identifier spellings that appear in grep/bash output.
