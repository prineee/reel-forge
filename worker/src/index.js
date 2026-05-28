'use strict'

require('dotenv').config()

const express = require('express')
const reelRoutes = require('./routes/reelRoutes')

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json({ limit: '1mb' }))

// Health check — Railway uses this to verify the container is alive
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

app.use('/', reelRoutes)

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

// Unhandled error guard
app.use((err, _req, res, _next) => {
  console.error('[express]', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`\nReelForge worker listening on :${PORT}`)
  console.log(`  POST /generate-reel   — start reel generation`)
  console.log(`  GET  /health          — health check\n`)
})
