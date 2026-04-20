const express = require('express')
const router = express.Router()
const { verifyPassword, issueToken, requireAuth } = require('../middleware/auth')

router.post('/login', (req, res) => {
  const { password } = req.body || {}
  if (!process.env.APP_PASSWORD) {
    return res.status(503).json({ error: 'Login is not configured. Set APP_PASSWORD in Secrets.' })
  }
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ error: 'Auth not configured. Set JWT_SECRET in Secrets.' })
  }
  if (!verifyPassword(password)) {
    return res.status(401).json({ error: 'Incorrect password.' })
  }
  return res.json({ token: issueToken() })
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user })
})

module.exports = router
