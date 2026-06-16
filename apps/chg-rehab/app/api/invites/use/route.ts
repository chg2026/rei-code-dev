import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * Look up a Supabase auth user by email, paginating through listUsers so we
 * never miss a user that lives beyond the first page.
 */
async function findAuthUserByEmail(
  admin: SupabaseClient,
  emailLower: string
): Promise<SupabaseUser | null> {
  const PER_PAGE = 1000;
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const found = users.find((u) => u.email?.toLowerCase() === emailLower);
    if (found) return found;
    if (users.length < PER_PAGE) return null;
    page += 1;
  }
}

function alreadyAccepted(email: string) {
  return NextResponse.json({ success: true, email });
}

/**
 * Accept a team invite and provision the new teammate.
 *
 * Public route (see middleware PUBLIC_PATHS): a brand-new invited user has
 * no session yet. We create the Supabase auth user AND the Prisma `User`
 * inline here, then mark the invite Accepted. Creating the Prisma row up
 * front is important: on first login `syncSupabaseUser` finds the existing
 * row and takes the `refreshFromSupabase` path, which works even when the
 * Supabase `user_profiles` row is absent. The old deferred approach (only
 * stashing the token and letting login provision the row) dead-ended
 * because that login path hard-requires a `user_profiles` row this flow
 * never creates.
 *
 * Ordering matters: the cross-account guard runs BEFORE any Supabase
 * mutation so an invite can never reset the password of an existing user
 * that belongs to a different company.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
    full_name?: string;
  };

  const token = (body.token || "").trim();
  const password = body.password || "";
  const fullName = (body.full_name || "").trim();

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

  // Find a Pending, non-expired invite. Anything else is "invalid or expired".
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.status !== "Pending") {
    return NextResponse.json(
      { error: "Invalid or expired invite." },
      { status: 400 }
    );
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    await prisma.invite
      .update({ where: { id: invite.id }, data: { status: "Expired" } })
      .catch(() => undefined);
    return NextResponse.json(
      { error: "Invalid or expired invite." },
      { status: 400 }
    );
  }

  const emailLower = invite.email.toLowerCase();

  // ── Cross-account / idempotency guard (BEFORE any Supabase mutation) ──
  // If a Prisma user already exists for this email, this invite is either a
  // duplicate (same company → close it out) or a cross-tenant attempt
  // (different company → reject, and crucially do NOT touch their auth
  // credentials).
  const existingByEmail = await prisma.user.findUnique({
    where: { email: invite.email },
  });
  if (existingByEmail) {
    if (existingByEmail.companyId !== invite.companyId) {
      return NextResponse.json(
        { error: "That email already belongs to another account." },
        { status: 409 }
      );
    }
    await prisma.invite
      .update({
        where: { id: invite.id },
        data: {
          status: "Accepted",
          acceptedAt: new Date(),
          acceptedById: existingByEmail.id,
        },
      })
      .catch(() => undefined);
    return alreadyAccepted(invite.email);
  }

  // ── Provision the Supabase auth user ──
  const admin = getSupabaseAdminClient();
  let authUser: SupabaseUser | null;
  try {
    authUser = await findAuthUserByEmail(admin, emailLower);
  } catch (err) {
    console.error("[invites/use] listUsers failed", (err as Error).message);
    return NextResponse.json(
      { error: "Could not create your account. Please try again." },
      { status: 500 }
    );
  }

  if (!authUser) {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
    if (createError || !created?.user) {
      console.error("[invites/use] createUser failed", createError?.message);
      return NextResponse.json(
        { error: createError?.message || "Could not create your account." },
        { status: 500 }
      );
    }
    authUser = created.user;
  } else {
    // An auth user exists for this email but (per the guard above) no Prisma
    // user does — i.e. an orphan from a prior failed attempt. Safe to adopt
    // it and (re)set the password to the one they just chose.
    await admin.auth.admin
      .updateUserById(authUser.id, { password })
      .catch((err) =>
        console.error(
          "[invites/use] updateUserById failed",
          (err as Error).message
        )
      );
  }
  const authUserId = authUser.id;

  // Guard again by id: an auth user id could already map to a Prisma user
  // under a different email (rare). Same tenancy rules apply.
  const existingById = await prisma.user.findUnique({
    where: { id: authUserId },
  });
  if (existingById) {
    if (existingById.companyId !== invite.companyId) {
      return NextResponse.json(
        { error: "That account already belongs to another workspace." },
        { status: 409 }
      );
    }
    await prisma.invite
      .update({
        where: { id: invite.id },
        data: {
          status: "Accepted",
          acceptedAt: new Date(),
          acceptedById: existingById.id,
        },
      })
      .catch(() => undefined);
    return alreadyAccepted(invite.email);
  }

  // Derive a display name from the chosen full name or the email local-part.
  const localPart = invite.email.split("@")[0] || "Teammate";
  const displayName = fullName || localPart;
  const [firstName, ...rest] = displayName.split(/\s+/);
  const lastName = rest.length ? rest.join(" ") : null;
  const initials =
    [(firstName || "")[0], (lastName || "")[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    localPart[0]?.toUpperCase() ||
    "U";

  try {
    await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          id: authUserId,
          companyId: invite.companyId,
          email: invite.email,
          firstName: firstName || null,
          lastName,
          role: invite.role,
          initials,
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: {
          status: "Accepted",
          acceptedAt: new Date(),
          acceptedById: u.id,
        },
      });
      await tx.activityLogEntry.create({
        data: {
          companyId: invite.companyId,
          actorId: u.id,
          action: "user_invite_accepted",
          entity: "User",
          entityId: u.id,
          message: `${displayName || u.email || "Teammate"} joined the team as ${invite.role}`,
          meta: { email: invite.email, role: invite.role, inviteId: invite.id },
        },
      });
    });
  } catch (err) {
    // Concurrent accept race: another request already created the row. If a
    // matching user now exists for this company, treat as success.
    if ((err as { code?: string }).code === "P2002") {
      const now = await prisma.user.findFirst({
        where: { OR: [{ id: authUserId }, { email: invite.email }] },
      });
      if (now && now.companyId === invite.companyId) {
        await prisma.invite
          .update({
            where: { id: invite.id },
            data: {
              status: "Accepted",
              acceptedAt: new Date(),
              acceptedById: now.id,
            },
          })
          .catch(() => undefined);
        return alreadyAccepted(invite.email);
      }
    }
    console.error(
      "[invites/use] provisioning transaction failed",
      (err as Error).message
    );
    return NextResponse.json(
      { error: "Could not finish setting up your account. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, email: invite.email });
}
