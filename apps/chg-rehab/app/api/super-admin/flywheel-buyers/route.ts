import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superAdmin";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const db = getSupabaseAdminClient();

  // Fetch all buyers
  const { data: buyers, error: bErr } = await db
    .from("deallink_buyers")
    .select("id, account_id, name, phone, source, im_registered_at, created_at")
    .order("created_at", { ascending: false });

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  // Fetch all profiles to map account_id → wholesaler handle/name
  const { data: profiles } = await db
    .from("deallink_profiles")
    .select("account_id, handle, name");

  const profileMap: Record<string, { handle: string; name: string }> = {};
  for (const p of profiles || []) {
    profileMap[p.account_id] = { handle: p.handle, name: p.name };
  }

  const rows = (buyers || []).map((b) => ({
    ...b,
    wholesaler: profileMap[b.account_id] || null,
  }));

  return NextResponse.json({ buyers: rows });
}
