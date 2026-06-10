import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superAdmin";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function goldBridgeUrl(): string {
  return (process.env.LEGACY_API_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
}

export async function GET() {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${goldBridgeUrl()}/api/deallink/admin/profiles`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Admin backend unreachable." }, { status: 502 });
  }
}
