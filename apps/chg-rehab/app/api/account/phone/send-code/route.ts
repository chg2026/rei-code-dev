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
    // Surface Twilio's status/code (never secret values) so logs and the client
    // can distinguish causes: 20404 = wrong/missing Verify Service SID,
    // 20003 = wrong auth token.
    const err = e as { status?: number; code?: number | string; message?: string };
    console.error(
      "[phone/send-code] Twilio error:",
      err.status,
      err.code,
      err.message
    );
    return NextResponse.json(
      {
        error: "We couldn't send a code to that number. Check the number and try again.",
        code: err.code ?? null,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, phone: normalized });
}
