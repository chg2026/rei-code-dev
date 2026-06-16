/**
 * Diagnostic: find Supabase auth users created in the last 24h that do NOT
 * have a corresponding Prisma `User` row (orphans from failed invite
 * acceptances). Read-only — logs emails so they can be cleaned up manually.
 *
 * Run: node_modules/.bin/tsx apps/chg-rehab/scripts/check-orphan-auth-users.ts
 */
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../lib/prisma";

async function main() {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    console.error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot list auth users."
    );
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent: { id: string; email: string | null; created_at: string }[] = [];

  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      console.error("listUsers failed:", error.message);
      process.exit(1);
    }
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.created_at && new Date(u.created_at).getTime() >= cutoff) {
        recent.push({
          id: u.id,
          email: u.email ?? null,
          created_at: u.created_at,
        });
      }
    }
    if (users.length < 1000) break;
    page += 1;
  }

  const orphans: { id: string; email: string | null; created_at: string }[] =
    [];
  for (const u of recent) {
    const prismaUser = await prisma.user.findFirst({
      where: {
        OR: [{ id: u.id }, ...(u.email ? [{ email: u.email }] : [])],
      },
      select: { id: true },
    });
    if (!prismaUser) orphans.push(u);
  }

  console.log(`Auth users created in last 24h: ${recent.length}`);
  console.log(`Orphaned (no Prisma User): ${orphans.length}`);
  for (const o of orphans) {
    console.log(
      `  ORPHAN  email=${o.email ?? "(none)"}  id=${o.id}  created=${o.created_at}`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
