// Centralized Twilio client + SMS helpers.
//
// Intentionally lazy — we don't construct the client at require() time so
// the server still boots if Twilio creds aren't set in dev. Callers MUST
// handle the case where send fails / client is unavailable.
//
// Reads:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_MESSAGING_SERVICE_SID  (preferred)  — or  TWILIO_FROM_NUMBER
const crypto = require('crypto')

let _client = null
function client() {
  if (_client !== null) return _client
  const sid = process.env.TWILIO_ACCOUNT_SID
  const tok = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !tok) {
    console.warn('[twilio] credentials not set — SMS sending disabled')
    _client = false
    return false
  }
  try {
    _client = require('twilio')(sid, tok)
    return _client
  } catch (e) {
    console.error('[twilio] failed to construct client', e.message)
    _client = false
    return false
  }
}

function isConfigured() {
  return !!client()
}

// Cryptographically random 6-digit code (PDF §7.2 step 1).
function generateSmsCode() {
  return crypto.randomInt(100000, 1000000).toString().padStart(6, '0')
}

// Best-effort E.164 normalization. Strips non-digits, prepends +. If the
// number already has a leading +, we keep it. This is *not* a full E.164
// validator — Twilio will hard-reject malformed numbers when we send.
function normalizePhone(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '')
  // Bare US number (10 digits) gets a +1 prefix; anything else, just +.
  const digits = s.replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  return '+' + digits
}

async function sendSms(to, body) {
  const c = client()
  if (!c) throw new Error('Twilio is not configured on this server.')
  const params = { to, body }
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    params.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  } else if (process.env.TWILIO_FROM_NUMBER) {
    params.from = process.env.TWILIO_FROM_NUMBER
  } else {
    throw new Error('Twilio sender not configured (TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER).')
  }
  return c.messages.create(params)
}

module.exports = { client, isConfigured, generateSmsCode, normalizePhone, sendSms }
