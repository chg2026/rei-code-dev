import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentContractor } from "@/lib/auth";
import { acceptInvitationForAccount, declineInvitation } from "@/lib/contractorProjectInvitationInbox";

const Body = z.object({ action: z.enum(["accept", "decline"]), agreementAccepted: z.boolean().optional() });

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const contractor = await getCurrentContractor();
  if (!contractor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!contractor.contractorPortalEnabled || contractor.status !== "Active") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { id } = await context.params;
  const result = parsed.data.action === "accept"
    ? await acceptInvitationForAccount({ invitationId: id, accountId: contractor.id, accountEmail: contractor.email, agreementAccepted: parsed.data.agreementAccepted === true })
    : await declineInvitation({ invitationId: id, accountId: contractor.id, accountEmail: contractor.email });
  if (!result.ok) {
    const status = result.outcome === "not_found" ? 404 : result.outcome === "agreement_required" ? 400 : result.outcome === "conflict" ? 409 : 410;
    return NextResponse.json({ error: result.outcome }, { status });
  }
  return NextResponse.json({ ok: true, activeAccessGranted: false, jobsCreated: 0, assignmentsCreated: 0, edgesCreated: 0 });
}
