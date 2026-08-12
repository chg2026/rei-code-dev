import { NextResponse } from "next/server";
import { getCurrentContractor } from "@/lib/auth";
import { listPendingInvitations } from "@/lib/contractorProjectInvitationInbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const contractor = await getCurrentContractor();
  if (!contractor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!contractor.contractorPortalEnabled || contractor.status !== "Active") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ invitations: await listPendingInvitations(contractor.id, contractor.email) });
}
