// Buyer SMS auth — the IM gate's backend.
//
// Mounted at /api/auth/buyer (no auth middleware on the router itself —
// each handler decides). Uses the existing Twilio client via
// server/lib/twilio.js and writes to public.buyer_accounts +
// public.sms_verification_codes (created in module-2 migration).
//
// Endpoints (PDF §4.2):
//   POST /send-code         { name, phone }
//   POST /verify-code       { phone, code }   → { token, buyer }
//   POST /resend-code       { phone }
//   POST /unlock-wholesaler                   (requires buyer token)
//   GET  /me                                   (requires buyer token)

const express = require('express')
const { supabaseAdmin } = require('../middleware/auth')
const { generateSmsCode, normalizePhone, sendSms, isConfigured: twilioConfigured } = require('../lib/twilio')
const { signBuyerToken, requireBuyer } = require('../middleware/buyer-auth')

const router = express.Router()

const CODE_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5
const RATE_LIMIT_PER_HOUR = 3   // PDF §7.2 step 5

function dbOrFail(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase admin client not configured.' })
    return null
  }
  return supabaseAdmin
}

// Touch buyer_accounts: insert if new, update name+last_seen_at if known.
async function upsertBuyer(db, { phone, name }) {
  const { data: existing } = await db
    .from('buyer_accounts')
    .select('id, name, phone_verified, wholesaler_enabled')
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    const patch = { last_seen_at: new Date().toISOString() }
    if (name && existing.name !== name) patch.name = name
    await db.from('buyer_accounts').update(patch).eq('id', existing.id)
    return existing
  }

  const { data: created, error } = await db
    .from('buyer_accounts')
    .insert({ name: name || 'Buyer', phone, phone_verified: false })
    .select('id, name, phone_verified, wholesaler_enabled')
    .single()
  if (error) throw error
  return created
}

// POST /send-code  — create a code, store, send via Twilio
router.post('/send-code', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const phone = normalizePhone(req.body?.phone)
  const name  = String(req.body?.name || '').trim().slice(0, 100)
  if (!phone || phone.length < 8) return res.status(400).json({ error: 'A valid phone number is required.' })
  if (!name)                       return res.status(400).json({ error: 'Name is required.' })

  // Rate-limit: max RATE_LIMIT_PER_HOUR codes per phone per rolling hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: cErr } = await db
    .from('sms_verification_codes')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', oneHourAgo)
  if (cErr) return res.status(500).json({ error: cErr.message })
  if ((count || 0) >= RATE_LIMIT_PER_HOUR) {
    return res.status(429).json({ error: 'Too many code requests for this number. Try again later.' })
  }

  try {
    await upsertBuyer(db, { phone, name })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  // Wipe any prior un-verified codes for this phone (PDF §7.2 step 2).
  await db.from('sms_verification_codes').delete().eq('phone', phone)

  const code = generateSmsCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString()
  const { error: iErr } = await db
    .from('sms_verification_codes')
    .insert({ phone, code, expires_at: expiresAt, attempts: 0 })
  if (iErr) return res.status(500).json({ error: iErr.message })

  if (!twilioConfigured()) {
    // Dev fallback — return the code in the response so the gate can be
    // tested without a live Twilio account. We log loudly so this can't
    // be missed during a deploy review.
    console.warn(`[auth-buyer] DEV mode: SMS not sent. code=${code} phone=${phone}`)
    return res.json({ success: true, dev_code: code })
  }

  try {
    await sendSms(phone, `Your DealLink verification code is: ${code}. Expires in 10 minutes.`)
  } catch (e) {
    // Roll back the stored code so the user can retry without hitting
    // the rate limit on the next attempt being a no-op.
    await db.from('sms_verification_codes').delete().eq('phone', phone)
    return res.status(502).json({ error: 'Failed to send SMS. Please try again.' })
  }
  res.json({ success: true })
})

// POST /verify-code
router.post('/verify-code', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const phone = normalizePhone(req.body?.phone)
  const code  = String(req.body?.code || '').trim()
  if (!phone) return res.status(400).json({ error: 'Phone is required.' })
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Code must be 6 digits.' })

  const { data: rec, error: rErr } = await db
    .from('sms_verification_codes')
    .select('id, code, expires_at, attempts')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (rErr) return res.status(500).json({ error: rErr.message })
  if (!rec) return res.status(400).json({ error: 'No active code for this number. Request a new one.' })

  if (new Date(rec.expires_at).getTime() < Date.now()) {
    await db.from('sms_verification_codes').delete().eq('id', rec.id)
    return res.status(400).json({ error: 'Code expired. Please request a new one.' })
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await db.from('sms_verification_codes').delete().eq('id', rec.id)
    return res.status(429).json({ error: 'Too many attempts. Please request a new code.' })
  }

  if (rec.code !== code) {
    await db.from('sms_verification_codes').update({ attempts: rec.attempts + 1 }).eq('id', rec.id)
    return res.status(400).json({ error: 'Incorrect code. Try again.' })
  }

  // Success — promote buyer + clean up + sign token.
  const { data: buyer, error: bErr } = await db
    .from('buyer_accounts')
    .update({ phone_verified: true, last_seen_at: new Date().toISOString() })
    .eq('phone', phone)
    .select('id, name, phone, phone_verified, wholesaler_enabled')
    .maybeSingle()
  if (bErr || !buyer) return res.status(500).json({ error: bErr?.message || 'Buyer not found.' })

  await db.from('sms_verification_codes').delete().eq('phone', phone)

  const token = signBuyerToken({ buyerId: buyer.id, phone: buyer.phone })
  res.json({ token, buyer })
})

// POST /resend-code  (PDF §4.2: deletes existing code + resends)
router.post('/resend-code', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const phone = normalizePhone(req.body?.phone)
  if (!phone) return res.status(400).json({ error: 'Phone is required.' })

  // Re-use the rate limit window from send-code.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await db
    .from('sms_verification_codes')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', oneHourAgo)
  if ((count || 0) >= RATE_LIMIT_PER_HOUR) {
    return res.status(429).json({ error: 'Too many code requests. Try again later.' })
  }

  // Buyer must already exist (they sent name in /send-code first).
  const { data: buyer } = await db
    .from('buyer_accounts').select('id').eq('phone', phone).maybeSingle()
  if (!buyer) return res.status(400).json({ error: 'No pending verification for this number.' })

  await db.from('sms_verification_codes').delete().eq('phone', phone)
  const code = generateSmsCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString()
  const { error: iErr } = await db
    .from('sms_verification_codes')
    .insert({ phone, code, expires_at: expiresAt, attempts: 0 })
  if (iErr) return res.status(500).json({ error: iErr.message })

  if (!twilioConfigured()) {
    console.warn(`[auth-buyer] DEV mode: SMS not sent. code=${code} phone=${phone}`)
    return res.json({ success: true, dev_code: code })
  }
  try {
    await sendSms(phone, `Your DealLink verification code is: ${code}. Expires in 10 minutes.`)
  } catch (e) {
    await db.from('sms_verification_codes').delete().eq('phone', phone)
    return res.status(502).json({ error: 'Failed to resend SMS.' })
  }
  res.json({ success: true })
})

// POST /unlock-wholesaler  (PDF §8.3 — feature flag flip)
router.post('/unlock-wholesaler', requireBuyer, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const { data, error } = await db
    .from('buyer_accounts')
    .update({ wholesaler_enabled: true })
    .eq('id', req.buyer.id)
    .select('id, name, phone, phone_verified, wholesaler_enabled')
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data)  return res.status(404).json({ error: 'Buyer not found.' })
  res.json({ buyer: data })
})

// GET /me  — current buyer (used after page reload to rehydrate UI).
router.get('/me', requireBuyer, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const { data, error } = await db
    .from('buyer_accounts')
    .select('id, name, phone, phone_verified, wholesaler_enabled, created_at')
    .eq('id', req.buyer.id)
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!data)  return res.status(404).json({ error: 'Buyer not found.' })
  res.json({ buyer: data })
})

module.exports = router
