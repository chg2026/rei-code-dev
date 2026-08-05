#!/usr/bin/env python3
"""Static safety checks for the unexecuted guarded contractor migration."""
from pathlib import Path
import re

ROOT = Path(__file__).parent
sql = (ROOT / "migration.sql").read_text()

for forbidden in (r"^\s*DROP\b", r"^\s*DELETE\s+FROM\b", r"^\s*TRUNCATE\b", r"^\s*UPDATE\b"):
    assert not re.search(forbidden, sql, re.I | re.M), f"forbidden SQL found: {forbidden}"
assert "auth." not in sql.lower(), "auth schema must not be touched"
assert sql.count("BEGIN;") == 1 and sql.count("COMMIT;") == 1
assert "RAISE EXCEPTION" in sql
assert "enumsortorder" in sql and "actual IS DISTINCT FROM expected" in sql
assert "ContractorProjectInvitation" in sql
assert "no data-safe repair is possible" in sql
assert "pg_get_expr" in sql and "attnotnull" in sql
assert "indisunique" in sql and "indkey" in sql
assert "indpred" in sql and "indnatts" in sql and "indnkeyatts" in sql
assert "indoption" in sql and "pg_opclass" in sql and "opcdefault" in sql
assert "confdeltype" in sql and "confupdtype" in sql
assert "actual_referenced_schema" in sql and "rn.nspname" in sql
assert "normalized_actual_default" in sql and "IS DISTINCT FROM normalized_expected_default" in sql
assert "CREATE TABLE public.\"ContractorProjectInvitation\"" in sql
assert '"updatedAt" TIMESTAMP(3) NOT NULL,' in sql
assert not re.search(r'"updatedAt"\s+TIMESTAMP\(3\)\s+NOT NULL\s+DEFAULT', sql, re.I)
assert not re.search(r'ADD COLUMN\s+"(?:id|companyId|projectId|contactId|emailSnapshot|role|roleKey|status|expiresAt|agreementVersion)"', sql, re.I)
for name in (
    "Contact_contractorPortalAccountId_idx",
    "ContractorProjectInvitation_inviteTokenHash_key",
    "ContractorProjectInvitation_companyId_projectId_contactId_r_key",
    "ContractorProjectInvitation_companyId_status_idx",
    "ContractorProjectInvitation_companyId_projectId_status_idx",
    "ContractorProjectInvitation_contactId_status_idx",
    "ContractorProjectInvitation_cpAccountId_idx",
    "Contact_contractorPortalAccountId_fkey",
    "ContractorProjectInvitation_companyId_fkey",
    "ContractorProjectInvitation_projectId_fkey",
    "ContractorProjectInvitation_contactId_fkey",
    "ContractorProjectInvitation_cpAccountId_fkey",
):
    assert name in sql, f"missing guarded object: {name}"
print("guarded migration static checks: PASS")
