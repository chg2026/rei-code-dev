// Buyer JWT middleware — completely separate from the wholesaler
// Supabase auth in middleware/auth.js (per IM handoff PDF §8). A buyer
// JWT is issued by /api/auth/buyer/verify-code and ONLY proves SMS
// possession of a phone number. It never grants access to wholesaler
// routes. Likewise, a wholesaler Supabase token is rejected here.
//
// Token payload: { sub: <buyer_id>, type: "buyer", phone, iat, exp }
//
// Secret resolution:
//   process.env.BUYER_JWT_SECRET   — preferred (must be set in prod)
//   else: random per-process secret with a console warning. This means
//   restarting the dev server invalidates outstanding buyer tokens —
//   acceptable for dev, fatal for prod.

const jwt = require('jsonwebtoken')
const crypto = require('crypto')

let _secret = process.env.BUYER_JWT_SECRET || null
if (!_secret) {
  _secret = crypto.randomBytes(48).toString('hex')
  console.warn('[buyer-auth] BUYER_JWT_SECRET not set — using a random per-process secret. Set BUYER_JWT_SECRET in production.')
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30  // 30 days, per PDF §8.1

function signBuyerToken({ buyerId, phone }) {
  return jwt.sign(
    { sub: buyerId, type: 'buyer', phone },
    _secret,
    { expiresIn: TOKEN_TTL_SECONDS },
  )
}

function verifyBuyerToken(token) {
  try {
    const decoded = jwt.verify(token, _secret)
    if (!decoded || decoded.type !== 'buyer' || !decoded.sub) return null
    return decoded
  } catch {
    return null
  }
}

// Express middleware — 401s if no/invalid buyer token. On success
// attaches req.buyer = { id, phone }.
function requireBuyer(req, res, next) {
  const header = req.headers.authorization || ''
  const m = header.match(/^Bearer\s+(.+)$/i)
  if (!m) return res.status(401).json({ error: 'Buyer authentication required.' })
  const decoded = verifyBuyerToken(m[1])
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired buyer session.' })
  req.buyer = { id: decoded.sub, phone: decoded.phone }
  next()
}

// Soft variant — attaches req.buyer if token is valid, but does NOT 401
// if missing/invalid. Used by GET /api/im/deal/:slug so the public page
// can render the gate or the IM in a single endpoint.
function attachBuyerIfPresent(req, _res, next) {
  const header = req.headers.authorization || ''
  const m = header.match(/^Bearer\s+(.+)$/i)
  if (m) {
    const decoded = verifyBuyerToken(m[1])
    if (decoded) req.buyer = { id: decoded.sub, phone: decoded.phone }
  }
  next()
}

module.exports = { signBuyerToken, verifyBuyerToken, requireBuyer, attachBuyerIfPresent, TOKEN_TTL_SECONDS }
