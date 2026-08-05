import Link from "next/link";
import AcceptInviteAction from "./AcceptInviteAction";
import { prisma } from "@/lib/prisma";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { inspectInvitation, invitationOutcomeMessage } from "@/lib/contractorProjectInvitationAcceptance";

export const dynamic = "force-dynamic";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="login-shell"><div className="login-card" style={{ gridTemplateColumns: "1fr", maxWidth: 560 }}><div className="login-right">{children}</div></div></div>;
}

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token?.trim() || "";
  const invitation = await inspectInvitation(token);
  if (invitation.outcome !== "valid" || !invitation.summary) {
    return (
      <Card>
        <div className="login-title">Invitation unavailable</div>
        <div className="login-sub">{invitationOutcomeMessage(invitation.outcome)}</div>
        {invitation.outcome === "accepted" ? <Link href="/login" style={{ color: "#D85A30", fontWeight: 600 }}>Sign in</Link> : null}
      </Card>
    );
  }

  const { summary } = invitation;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const account = user ? await prisma.cpAccount.findUnique({ where: { id: user.id }, select: { id: true } }) : null;
  const loginHref = `/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`;
  return (
    <Card>
      <div className="login-title">Project invitation</div>
      <div className="login-sub">You have been invited to work with {summary.companyName}.</div>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "10px 18px", margin: "24px 0", fontSize: 14 }}>
        <dt style={{ color: "#6B7280" }}>Project</dt><dd style={{ margin: 0, fontWeight: 600 }}>{summary.projectCode} · {summary.projectName}</dd>
        <dt style={{ color: "#6B7280" }}>Company</dt><dd style={{ margin: 0 }}>{summary.companyName}</dd>
        <dt style={{ color: "#6B7280" }}>Role</dt><dd style={{ margin: 0 }}>{summary.role}{summary.trade ? ` · ${summary.trade}` : ""}</dd>
        <dt style={{ color: "#6B7280" }}>Agreement</dt><dd style={{ margin: 0 }}>Version {summary.agreementVersion} (required)</dd>
        <dt style={{ color: "#6B7280" }}>Invited email</dt><dd style={{ margin: 0 }}>{summary.email}</dd>
      </dl>
      <p style={{ color: "#6B7280", fontSize: 13 }}>You will review and explicitly accept the agreement after signing in. Accepting this invitation does not create a job or grant active project access yet.</p>
      {account ? <AcceptInviteAction token={token} summary={summary} /> : (
        <div style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
          <Link href={loginHref} className="login-cta" style={{ textAlign: "center", textDecoration: "none" }}>Sign in to accept</Link>
          <Link href="/signup" style={{ alignSelf: "center", color: "#D85A30", fontWeight: 600 }}>New to the portal? Sign up first</Link>
        </div>
      )}
    </Card>
  );
}
