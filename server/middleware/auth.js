const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET
const APP_PASSWORD = process.env.APP_PASSWORD
const TOKEN_TTL = '7d'

if (!JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set — auth tokens cannot be issued.')
}
if (!APP_PASSWORD) {
  console.warn('[auth] APP_PASSWORD is not set — login is disabled until you set it in Secrets.')
}

function issueToken() {
  return jwt.sign({ role: 'team' }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

function verifyPassword(password) {
  if (!APP_PASSWORD || typeof password !== 'string') return false
  // Constant-time-ish comparison
  if (password.length !== APP_PASSWORD.length) return false
  let mismatch = 0
  for (let i = 0; i < password.length; i++) {
    mismatch |= password.charCodeAt(i) ^ APP_PASSWORD.charCodeAt(i)
  }
  return mismatch === 0
}

function requireAuth(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: 'Auth not configured on server.' })
  }
  const header = req.headers.authorization || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return res.status(401).json({ error: 'Authentication required.' })
  try {
    req.user = jwt.verify(match[1], JWT_SECRET)
    return next()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }
}

module.exports = { requireAuth, verifyPassword, issueToken }
