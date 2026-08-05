import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { acceptInvitation, invitationOutcomeMessage } from "@/lib/contractorProjectInvitationAcceptance";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(1),
  agreementAccepted: z.literal(true),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "agreement_required", message: "You must explicitly accept the agreement before continuing." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Do not call getCurrentContractor here: it mirrors/creates CpAccount on
  // first sign-in. Acceptance requires an already-existing CpAccount, so a
  // newly authenticated user gets a safe no-access response instead.
  const account = await prisma.cpAccount.findUnique({ where: { id: user.id }, select: { id: true, email: true, status: true, contractorPortalEnabled: true } });
  if (!account) {
    return NextResponse.json({ error: "account_not_ready", message: "Your contractor account is not ready yet. Finish signup, then sign in and try again." }, { status: 403 });
  }
  if (account.status === "Suspended" || !account.contractorPortalEnabled) {
    return NextResponse.json({ error: "blocked", message: "This contractor account cannot accept invitations." }, { status: 403 });
  }

  const result = await acceptInvitation({
    token: parsed.data.token,
    accountId: account.id,
    accountEmail: account.email || user.email,
    agreementAccepted: parsed.data.agreementAccepted,
  });
  if (!result.ok) {
    const status = result.outcome === "invalid" ? 404 : result.outcome === "email_mismatch" ? 403 : result.outcome === "accepted" ? 409 : result.outcome === "agreement_required" ? 400 : 410;
    return NextResponse.json({ error: result.outcome, message: invitationOutcomeMessage(result.outcome) }, { status });
  }
  return NextResponse.json({ ok: true, invitation: result.summary, activeAccessGranted: false, jobsCreated: 0, edgesCreated: 0 });
}
