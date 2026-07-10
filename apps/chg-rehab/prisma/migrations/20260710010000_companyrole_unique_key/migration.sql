-- CompanyRole.@@unique([companyId, key]) was declared in schema.prisma but the
-- initial roles migrations only created a plain index on companyId. The
-- upsert({ where: { companyId_key } }) used by the permissions provisioning
-- helper requires the compound unique constraint to exist in the database.
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyRole_companyId_key_key"
  ON "CompanyRole"("companyId", "key");
