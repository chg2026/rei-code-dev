const express = require('express')
const cors = require('cors')
const path = require('path')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// API routes
app.use('/api/properties', require('./routes/properties'))
app.use('/api/contractors', require('./routes/contractors'))
app.use('/api/projects', require('./routes/projects'))
app.use('/api/tenants', require('./routes/tenants'))
app.use('/api/deals', require('./routes/deals'))
app.use('/api/tasks', require('./routes/tasks'))
app.use('/api/invoices', require('./routes/invoices'))

// Serve React build in production
const fs = require('fs')
const buildPath = path.join(__dirname, '../client/build')
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

app.listen(PORT, () => {
  console.log(`CHG CRM server running on port ${PORT}`)
})

module.exports = app
