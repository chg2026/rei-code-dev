import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superAdmin";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * Base URL of the shared Gold Bridge Express server that hosts the
 * Deal Link admin API (`/api/deallink/admin/*`). Mirrors the resolution
 * logic in `lib/legacyAdminProxy.ts`.
 */
function legacyBaseUrl(): string {
  const explicit = process.env.LEGACY_API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return "http://localhost:8080";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const gate = await requireSuperAdmin();
  if (gate instanceof NextResponse) return gate;

  const { handle } = await params;

  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url =
    legacyBaseUrl() +
    "/api/deallink/admin/profiles/" +
    encodeURIComponent(handle) +
    "/ambassador";

  const init: RequestInit = {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  };
  const text = await req.text();
  if (text) init.body = text;

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (e) {
    console.error("[super-admin flywheel-profiles] upstream fetch failed:", (e as Error).message);
    return NextResponse.json({ error: "Admin backend unreachable." }, { status: 502 });
  }

  const buf = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") || "application/json";
  return new NextResponse(buf, {
    status: upstream.status,
    headers: { "content-type": contentType },
  });
}
