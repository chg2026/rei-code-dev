import { NextRequest, NextResponse } from "next/server";
import { getCurrentContractor } from "@/lib/auth";
import { claimProjectInvitation } from "@/lib/projectInvitationClaim";

export const dynamic = "force-dynamic";

async function claim(req: NextRequest) {
  const contractor = await getCurrentContractor();
  if (!contractor) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url));
  const token = req.nextUrl.searchParams.get("projectToken") || (await req.json().catch(() => null) as { projectToken?: string } | null)?.projectToken;
  if (!token) return NextResponse.json({ error: "projectToken is required" }, { status: 400 });
  const result = await claimProjectInvitation({ projectToken: token, accountId: contractor.id, accountEmail: contractor.email });
  if (req.method === "GET") return NextResponse.redirect(new URL("/invitations", req.url));
  if (result.ok) return NextResponse.json(result);
  const status = result.outcome === "email_mismatch" ? 403 : result.outcome === "invalid" ? 404 : result.outcome === "conflict" ? 409 : 410;
  return NextResponse.json({ error: result.outcome }, { status });
}

export async function GET(req: NextRequest) { return claim(req); }
export async function POST(req: NextRequest) { return claim(req); }
