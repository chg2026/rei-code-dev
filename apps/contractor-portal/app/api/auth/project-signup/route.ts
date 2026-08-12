import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabaseServer";
import { claimProjectInvitation, hashProjectInvitationToken } from "@/lib/projectInvitationClaim";

export const dynamic = "force-dynamic";

const Body = z.object({
  projectToken: z.string().min(8),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2),
  companyName: z.string().min(2),
  phone: z.string().optional(),
  trade: z.string().optional(),
});

async function findAuthUser(admin: ReturnType<typeof getSupabaseAdminClient>, email: string) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return null;
    const found = data.users.find((user) => (user.email || "").trim().toLowerCase() === email.trim().toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

/** New-contractor project invitation path. Legacy /api/auth/signup is unchanged. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  const input = parsed.data;
  const invitation = await prisma.contractorProjectInvitation.findUnique({ where: { inviteTokenHash: hashProjectInvitationToken(input.projectToken) } });
  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (invitation.status !== "Pending" || invitation.expiresAt < new Date() || (invitation.inviteTokenExpiresAt && invitation.inviteTokenExpiresAt < new Date())) return NextResponse.json({ error: "Invitation is no longer available" }, { status: 410 });
  if (invitation.emailSnapshot.trim().toLowerCase() !== input.email.trim().toLowerCase()) return NextResponse.json({ error: "Invitation email does not match this account." }, { status: 403 });
  const admin = getSupabaseAdminClient();
  const existing = await findAuthUser(admin, input.email);
  if (existing) {
    const account = await prisma.cpAccount.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    if (!account) return NextResponse.json({ error: "already_registered", message: "Sign in first, then open the invitation link again." }, { status: 409 });
    const client = await getSupabaseServerClient();
    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
    if (signInError) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    const claimed = await claimProjectInvitation({ projectToken: input.projectToken, accountId: account.id, accountEmail: account.email });
    if (!claimed.ok) return NextResponse.json({ error: claimed.outcome }, { status: claimed.outcome === "email_mismatch" ? 403 : 409 });
    return NextResponse.json({ ok: true, autoLogin: true, invitationId: claimed.invitationId, session: signInData.session });
  }

  const { data, error } = await admin.auth.admin.createUser({ email: input.email.trim(), password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName } });
  if (error || !data.user) return NextResponse.json({ error: error?.message || "Failed to create account" }, { status: 500 });
  const userId = data.user.id;
  const email = (data.user.email || input.email).trim().toLowerCase();

  try {
    if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    const profile = await admin.from("user_profiles").upsert({ id: userId, email, full_name: input.fullName, phone: input.phone || null, is_contractor: true, status: "active" }, { onConflict: "id" });
    if (profile.error) throw new Error(`Profile upsert failed: ${profile.error.message}`);
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.cpAccount.create({ data: { id: userId, email, contactName: input.fullName, companyName: input.companyName, phone: input.phone || null, trade: input.trade || invitation.trade, lastLoginAt: new Date() } });
      return claimProjectInvitation({ projectToken: input.projectToken, accountId: userId, accountEmail: email, client: tx });
    });
    if (!claimed.ok) throw new Error(`Invitation claim failed: ${claimed.outcome}`);
    const { data: session, error: signInError } = await (await getSupabaseServerClient()).auth.signInWithPassword({ email, password: input.password });
    if (signInError || !session.session) return NextResponse.json({ ok: true, autoLogin: false, invitationId: claimed.invitationId, session: null });
    return NextResponse.json({ ok: true, autoLogin: true, invitationId: claimed.invitationId, session: session.session });
  } catch (err) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    await admin.from("user_profiles").delete().eq("id", userId);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to claim invitation" }, { status: 500 });
  }
}
