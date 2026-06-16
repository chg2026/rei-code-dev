import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Validate an invite token for the /signup?token=… form. Public route (see
 * middleware PUBLIC_PATHS) — the invited user has no session yet. Returns the
 * invite email so the signup form can show it read-only.
 */
export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") || "").trim();
  if (!token) {
    return NextResponse.json(
      { valid: false, error: "Missing invite token." },
      { status: 400 }
    );
  }

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json(
      { valid: false, error: "This invite link is not valid." },
      { status: 404 }
    );
  }
  if (invite.status === "Accepted") {
    return NextResponse.json(
      { valid: false, error: "This invite has already been accepted." },
      { status: 409 }
    );
  }
  if (invite.status === "Revoked") {
    return NextResponse.json(
      { valid: false, error: "This invite was revoked by an admin." },
      { status: 409 }
    );
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    if (invite.status === "Pending") {
      await prisma.invite
        .update({ where: { id: invite.id }, data: { status: "Expired" } })
        .catch(() => undefined);
    }
    return NextResponse.json(
      {
        valid: false,
        error: "This invite has expired. Ask an admin to send a new one.",
      },
      { status: 410 }
    );
  }
  if (invite.status !== "Pending") {
    return NextResponse.json(
      { valid: false, error: "This invite is no longer valid." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    valid: true,
    email: invite.email,
    role: invite.role,
  });
}
