const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

const { requireAuth } = require('./middleware/auth')

// Public endpoints (no auth)
app.use('/api/auth', require('./routes/auth'))
app.get('/api/health', (req, res) => {
  res.json({ status: 'CHG CRM is running', version: '1.0.0', timestamp: new Date().toISOString() })
})

// Protected API routes — every CRUD endpoint requires a valid session token
app.use('/api/properties', requireAuth, require('./routes/properties'))
app.use('/api/contractors', requireAuth, require('./routes/contractors'))
app.use('/api/projects', requireAuth, require('./routes/projects'))
app.use('/api/tenants', requireAuth, require('./routes/tenants'))
app.use('/api/deals', requireAuth, require('./routes/deals'))
app.use('/api/tasks', requireAuth, require('./routes/tasks'))
app.use('/api/invoices', requireAuth, require('./routes/invoices'))

// Serve React build in production (after API routes)
const buildPath = path.join(__dirname, '..', 'client', 'build')
const hasBuild = fs.existsSync(path.join(buildPath, 'index.html'))

if (hasBuild) {
  app.use(express.static(buildPath))
  // React Router catch-all — Express 5 requires named wildcard (not bare *)
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'))
  })
} else {
  // Dev fallback — API-only mode
  app.get('/', (req, res) => {
    res.json({ status: 'CHG CRM API is running', version: '1.0.0', timestamp: new Date().toISOString() })
  })
}

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CHG CRM server running on port ${PORT}`)
})

module.exports = app
