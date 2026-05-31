const { Router } = require('express')
const { requireAuth, supabaseAdmin } = require('../middleware/auth')

const router = Router()

const ALERT_FIELDS = ['alert_type', 'geography', 'property_types', 'price_min', 'price_max', 'strategy']

function pickAlert(body) {
  const out = {}
  for (const k of ALERT_FIELDS) if (k in body) out[k] = body[k]
  return out
}

function dbOrFail(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase admin client not configured.' })
    return null
  }
  return supabaseAdmin
}

// GET /api/deallink/alerts
router.get('/', requireAuth, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  try {
    const { data, error } = await db
      .from('deallink_market_alerts')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json(data || [])
  } catch (err) {
    console.error('[deallink-alerts/list] Error:', err.message)
    res.status(500).json({ error: 'Failed to fetch alerts.' })
  }
})

// POST /api/deallink/alerts
router.post('/', requireAuth, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  try {
    const row = { ...pickAlert(req.body), user_id: req.user.id, active: true }

    const { data, error } = await db
      .from('deallink_market_alerts')
      .insert(row)
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err) {
    console.error('[deallink-alerts/create] Error:', err.message)
    res.status(500).json({ error: 'Failed to create alert.' })
  }
})

// PATCH /api/deallink/alerts/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  try {
    const updates = pickAlert(req.body)
    if ('active' in req.body) updates.active = req.body.active

    const { data, error } = await db
      .from('deallink_market_alerts')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Alert not found.' })
    res.json(data)
  } catch (err) {
    console.error('[deallink-alerts/update] Error:', err.message)
    res.status(500).json({ error: 'Failed to update alert.' })
  }
})

// DELETE /api/deallink/alerts/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  try {
    const { error } = await db
      .from('deallink_market_alerts')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)

    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    console.error('[deallink-alerts/delete] Error:', err.message)
    res.status(500).json({ error: 'Failed to delete alert.' })
  }
})

module.exports = router
