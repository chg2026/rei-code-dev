import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isValidIanaTimezone(tz: string): boolean {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      return Intl.supportedValuesOf("timeZone").includes(tz);
    }
  } catch {
    // fall through to the constructor check
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { timezone?: string } | null;
  const timezone = body?.timezone ?? "";
  if (!isValidIanaTimezone(timezone)) {
    return NextResponse.json(
      { error: "Choose a valid timezone." },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { timezone },
  });

  return NextResponse.json({ ok: true });
}
