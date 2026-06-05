// Buyer dashboard endpoints (PDF §4.3). All routes require a buyer JWT.

const express = require('express')
const { supabaseAdmin } = require('../middleware/auth')
const { requireBuyer } = require('../middleware/buyer-auth')

const router = express.Router()
router.use(requireBuyer)

function dbOrFail(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase admin client not configured.' })
    return null
  }
  return supabaseAdmin
}

// GET /api/buyer/dashboard  — counts only. Heavy lists go through /shared-deals.
router.get('/dashboard', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const { count: sharedCount } = await db
    .from('shared_deals_log')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_id', req.buyer.id)
  const { count: offerCount } = await db
    .from('shared_deals_log')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_id', req.buyer.id)
    .eq('offer_submitted', true)
  res.json({
    deals_shared_with_me: sharedCount || 0,
    offers_submitted: offerCount || 0,
    best_spread_seen: null,             // V2 — needs an aggregate query
  })
})

// GET /api/buyer/shared-deals  — paginated list joined to deallink_deals.
router.get('/shared-deals', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 100)
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)

  const { data: rows, error } = await db
    .from('shared_deals_log')
    .select(`
      id, accessed_at, offer_submitted,
      deallink_deals (
        id, im_slug, addr, city, state, photo_url, ask, arv, type, beds, baths, sqft, status,
        im_show_asking, im_show_arv, im_show_street_number
      )
    `)
    .eq('buyer_id', req.buyer.id)
    .order('accessed_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) return res.status(500).json({ error: error.message })

  const items = (rows || []).map((r) => {
    const d = r.deallink_deals || {}
    const showStreet = d.im_show_street_number !== false
    return {
      log_id: r.id,
      accessed_at: r.accessed_at,
      offer_submitted: r.offer_submitted,
      slug: d.im_slug,
      addr: showStreet ? d.addr : String(d.addr || '').replace(/^\d+\s+/, '— '),
      city: d.city, state: d.state, photo_url: d.photo_url,
      ask: d.im_show_asking ? d.ask : null,
      arv: d.im_show_arv    ? d.arv : null,
      type: d.type, beds: d.beds, baths: d.baths, sqft: d.sqft, status: d.status,
    }
  })
  res.json({ items, limit, offset })
})

module.exports = router
