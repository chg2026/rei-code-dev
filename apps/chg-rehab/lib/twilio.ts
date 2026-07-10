/**
 * Lazy Twilio helpers for SMS phone verification (Twilio Verify) and outbound
 * text messages (Twilio Messaging).
 *
 * The Twilio client is constructed on first use — never at import time — so the
 * app boots cleanly when TWILIO_* credentials are absent. Callers should gate
 * on isVerifyConfigured() / isSmsConfigured() before reaching for the client.
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

/**
 * True when we have account credentials plus a sender — either a Messaging
 * Service SID (preferred) or a single From number. Verify uses a different
 * service SID, so SMS sending is configured independently.
 */
export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)
  );
}

/**
 * Build (and cache) a Twilio client from the account credentials. Shared by the
 * Verify and Messaging helpers — the same account creds back both APIs.
 */
function buildClient(): Twilio {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials are not configured");
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

function getClient(): Twilio {
  if (!isVerifyConfigured()) {
    throw new Error("Twilio Verify is not configured");
  }
  return buildClient();
}

export type SendSmsResult =
  | { sent: true }
  | { sent: false; skipped: true; reason: string }
  | { sent: false; skipped: false; error: string };

/**
 * Send an SMS. Uses the Messaging Service SID when set (Twilio picks the
 * sender / handles pooling), otherwise falls back to TWILIO_FROM_NUMBER.
 *
 * When no SMS credentials are configured this is a no-op that logs a warning
 * and returns `{ sent: false, skipped: true }` so callers can leave the work
 * queued rather than marking it failed.
 */
export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  if (!isSmsConfigured()) {
    console.warn(
      "[twilio] sendSms called but SMS is not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER) — no-op."
    );
    return { sent: false, skipped: true, reason: "not-configured" };
  }
  try {
    const client = buildClient();
    const params: { to: string; body: string; messagingServiceSid?: string; from?: string } = {
      to,
      body,
    };
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      params.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    } else {
      params.from = process.env.TWILIO_FROM_NUMBER;
    }
    await client.messages.create(params);
    return { sent: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { sent: false, skipped: false, error };
  }
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
