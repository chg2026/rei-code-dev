import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Investor signup is invite-only. Operators provision investors directly
 * (via the operator portal / seed script); investors cannot self-register.
 * This endpoint always rejects so any stray client cannot bypass that.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "invite_only",
      message:
        "Investor accounts are invite-only. Please use the invite link your operator sent you.",
    },
    { status: 403 }
  );
}
