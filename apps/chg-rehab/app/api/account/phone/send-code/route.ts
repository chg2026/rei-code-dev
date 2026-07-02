import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  isVerifyConfigured,
  normalizeUsPhone,
  startPhoneVerification,
} from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { phone?: string } | null;
  const normalized = normalizeUsPhone(body?.phone ?? "");
  if (!normalized) {
    return NextResponse.json(
      { error: "Enter a valid US mobile number, e.g. (555) 123-4567." },
      { status: 400 }
    );
  }
  if (!isVerifyConfigured()) {
    return NextResponse.json(
      { error: "Text verification isn't set up yet. Please try again later." },
      { status: 503 }
    );
  }

  try {
    await startPhoneVerification(normalized);
  } catch (e) {
    console.error("[phone/send-code] Twilio error:", e);
    return NextResponse.json(
      { error: "We couldn't send a code to that number. Check the number and try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, phone: normalized });
}
