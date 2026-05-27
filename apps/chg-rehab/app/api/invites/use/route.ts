import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, type AppSession } from "@/lib/session";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
    full_name?: string;
  };

  const { token, password, full_name } = body;

  if (!token || !password) {
    return NextResponse.json(
      { error: "Token and password are required." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json(
      { error: "Invite not found or already used." },
      { status: 404 }
    );
  }
  if (invite.status !== "Pending") {
    return NextResponse.json(
      { error: "This invite has already been used or revoked." },
      { status: 409 }
    );
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This invite has expired. Ask an admin to send a new one." },
      { status: 410 }
    );
  }

  const admin = getSupabaseAdminClient();

  // Check whether a Supabase auth user already exists for this email.
  const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = listData?.users?.find(
    (u) => u.email?.toLowerCase() === invite.email.toLowerCase()
  );

  if (!existing) {
    const { error: createError } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: (full_name || "").trim() },
    });
    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }
  }

  // Stash the token in iron-session so syncSupabaseUser picks it up on
  // first login and creates the Prisma User record under the right company.
  const jsonRes = NextResponse.json({ ok: true, email: invite.email });
  const session = await getIronSession<AppSession>(req, jsonRes, sessionOptions);
  session.pendingInviteToken = token;
  await session.save();
  return jsonRes;
}
