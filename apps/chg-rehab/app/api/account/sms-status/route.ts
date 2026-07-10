import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/sms-status
 *
 * Lightweight endpoint the reminder card uses to decide whether to show the
 * SMS section. Returns the current user's phone-verification state and their
 * timezone (needed to compute exact send times from a reminder's local
 * dueDate/dueTime).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { phoneVerified: true, phoneNumber: true, timezone: true },
  });

  return NextResponse.json({
    phoneVerified: row?.phoneVerified ?? false,
    hasPhone: Boolean(row?.phoneNumber),
    timezone: row?.timezone ?? "America/New_York",
  });
}
