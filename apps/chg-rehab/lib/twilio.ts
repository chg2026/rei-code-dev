/**
 * Lazy Twilio Verify helper for SMS phone verification.
 *
 * The Twilio client is constructed on first use — never at import time — so the
 * app boots cleanly when TWILIO_* credentials are absent. Callers should gate
 * on isVerifyConfigured() before starting a verification.
 */
import twilio from "twilio";
import type { Twilio } from "twilio";

let cachedClient: Twilio | null = null;

function getVerifySid(): string {
  return process.env.TWILIO_VERIFY_SERVICE_SID ?? "";
}

export function isVerifyConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID
  );
}

function getClient(): Twilio {
  if (!isVerifyConfigured()) {
    throw new Error("Twilio Verify is not configured");
  }
  if (!cachedClient) {
    // The client is only constructed here — never at import time — so the app
    // still boots with no Twilio creds set.
    cachedClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return cachedClient;
}

/**
 * Normalize a US phone number to E.164 (+1XXXXXXXXXX).
 * Accepts 10-digit national numbers, 11 digits with a leading 1, and numbers
 * already in +1XXXXXXXXXX form (with any spacing/punctuation). Returns null
 * for anything that isn't a valid NANP number (area code and exchange must
 * start with 2–9).
 */
export function normalizeUsPhone(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  let national: string;
  if (digits.length === 10) {
    national = digits;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    national = digits.slice(1);
  } else {
    return null;
  }
  // NANP: area code and exchange code each begin with 2–9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return `+1${national}`;
}

/** Send an SMS verification code to the given E.164 number. */
export async function startPhoneVerification(phoneE164: string): Promise<void> {
  const client = getClient();
  await client.verify.v2
    .services(getVerifySid())
    .verifications.create({ to: phoneE164, channel: "sms" });
}

/** Check a verification code. Returns true only when Twilio approves it. */
export async function checkPhoneVerification(
  phoneE164: string,
  code: string
): Promise<boolean> {
  const client = getClient();
  const result = await client.verify.v2
    .services(getVerifySid())
    .verificationChecks.create({ to: phoneE164, code });
  return result.status === "approved";
}
