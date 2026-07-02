import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  checkPhoneVerification,
  isVerifyConfigured,
  normalizeUsPhone,
} from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { phone?: string; code?: string }
    | null;
  const normalized = normalizeUsPhone(body?.phone ?? "");
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!normalized) {
    return NextResponse.json(
      { error: "Enter a valid US mobile number, e.g. (555) 123-4567." },
      { status: 400 }
    );
  }
  if (!code) {
    return NextResponse.json({ error: "Enter the code we texted you." }, { status: 400 });
  }
  if (!isVerifyConfigured()) {
    return NextResponse.json(
      { error: "Text verification isn't set up yet. Please try again later." },
      { status: 503 }
    );
  }

  let approved = false;
  try {
    approved = await checkPhoneVerification(normalized, code);
  } catch (e) {
    console.error("[phone/verify-code] Twilio error:", e);
    return NextResponse.json(
      { error: "We couldn't check that code. Please try again." },
      { status: 502 }
    );
  }

  if (!approved) {
    return NextResponse.json(
      { error: "That code is invalid or expired." },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      phoneNumber: normalized,
      phoneVerified: true,
      phoneVerifiedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
