// Buyer-side IM endpoints — public deal lookup by slug + view logging.
//
// Mounted at /api/im. NO wholesaler auth here. The deal lookup is
// "soft-auth" (returns OG-safe summary even without a buyer token; full
// IM body only with a valid buyer token). View logging requires the
// buyer to be verified.

const express = require('express')
const { supabaseAdmin } = require('../middleware/auth')
const { requireBuyer, attachBuyerIfPresent } = require('../middleware/buyer-auth')

const router = express.Router()

function dbOrFail(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase admin client not configured.' })
    return null
  }
  return supabaseAdmin
}

// Fields a buyer is allowed to see, filtered by im_show_* toggles.
// Notice: `notes` is PRIVATE and NEVER returned. `description` is the
// public blurb. This contract mirrors deallink-public.js.
function imDealForBuyer(d, profile) {
  if (!d) return null
  const showStreet = d.im_show_street_number !== false
  let displayAddr = d.addr || ''
  if (!showStreet) displayAddr = displayAddr.replace(/^\d+\s+/, '— ')

  const out = {
    id: d.id,
    slug: d.im_slug,
    addr: displayAddr,
    city: d.city,
    state: d.state,
    zip: d.zip,
    type: d.type,
    units: d.units,
    beds: d.beds,
    baths: d.baths,
    sqft: d.sqft,
    occ: d.occ,
    access: d.access,
    status: d.status,
    description: d.description,
    photo_url: d.photo_url,
    tags: Array.isArray(d.tags) ? d.tags : [],
    is_new: d.is_new,
    created_at: d.created_at,
    // Visibility-gated fields (omit when toggled off so buyers can't
    // scrape disallowed values from the JSON).
    ask:           d.im_show_asking ? d.ask : null,
    arv:           d.im_show_arv    ? d.arv : null,
    show_repair:   d.im_show_repair === true,
    show_mao:      d.im_show_mao    === true,
    show_contact:  d.im_show_contact !== false,
    toggles: {
      asking:        d.im_show_asking         !== false,
      arv:           d.im_show_arv            !== false,
      repair:        d.im_show_repair         !== false,
      mao:           d.im_show_mao            === true,
      contact:       d.im_show_contact        !== false,
      street_number: d.im_show_street_number  !== false,
    },
  }

  if (profile && out.show_contact) {
    out.wholesaler = {
      handle: profile.handle,
      name: profile.name,
      initials: profile.initials,
      city: profile.city,
      avatar_url: profile.avatar_url,
    }
  }
  return out
}

// GET /api/im/deal/:slug
// Soft-authed. If a buyer token is attached, returns the full IM body
// (and writes a shared_deals_log row). If not, returns just the OG
// summary (title/description/image) so the gate page can render the
// deal pill at the top.
router.get('/deal/:slug', attachBuyerIfPresent, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const slug = String(req.params.slug || '').toLowerCase()
  if (!slug) return res.status(400).json({ error: 'Slug is required.' })

  const { data: deal, error: dErr } = await db
    .from('deallink_deals')
    .select('*')
    .eq('im_slug', slug)
    .maybeSingle()
  if (dErr) return res.status(500).json({ error: dErr.message })
  if (!deal) return res.status(404).json({ error: 'Deal not found.' })

  // Only New / Marketed / Under Contract deals are publicly viewable
  // (matches deallink-public.js). Closed/Dead deals 404.
  const PUBLIC_STATUSES = new Set(['New', 'Marketed', 'Under Contract'])
  if (!PUBLIC_STATUSES.has(deal.status)) {
    return res.status(404).json({ error: 'Deal is no longer available.' })
  }

  // OG-safe summary always returned. Show street number only if toggle
  // allows; never include private notes/contact in the og payload.
  const showStreet = deal.im_show_street_number !== false
  const displayAddr = showStreet
    ? (deal.addr || '')
    : String(deal.addr || '').replace(/^\d+\s+/, '— ')
  const summary = {
    slug,
    addr: displayAddr,
    city: deal.city,
    state: deal.state,
    photo_url: deal.photo_url || null,
    ask: deal.im_show_asking ? deal.ask : null,
    arv: deal.im_show_arv    ? deal.arv : null,
    type: deal.type,
    beds: deal.beds,
    baths: deal.baths,
    sqft: deal.sqft,
  }

  if (!req.buyer) {
    return res.json({ gated: true, summary })
  }

  // Authenticated buyer — fetch wholesaler profile + log view.
  const { data: profile } = await db
    .from('deallink_profiles')
    .select('handle, name, initials, city, avatar_url, account_id')
    .eq('account_id', deal.account_id)
    .maybeSingle()

  // Best-effort log view (idempotent via UNIQUE(buyer_id, deal_id)).
  await db
    .from('shared_deals_log')
    .upsert(
      { buyer_id: req.buyer.id, deal_id: deal.id, accessed_at: new Date().toISOString() },
      { onConflict: 'buyer_id,deal_id', ignoreDuplicates: false },
    )

  res.json({ gated: false, summary, deal: imDealForBuyer(deal, profile) })
})

// POST /api/im/log-view  { deal_id }
// Explicit log endpoint per PDF §4.3 — the GET above already logs, but
// some flows (e.g. SPA hydration after a refresh on /deal/:slug) call
// this directly to ensure the deal stays in "Deals shared with me".
router.post('/log-view', requireBuyer, async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const dealId = String(req.body?.deal_id || '')
  if (!dealId) return res.status(400).json({ error: 'deal_id is required.' })
  const { error } = await db
    .from('shared_deals_log')
    .upsert(
      { buyer_id: req.buyer.id, deal_id: dealId, accessed_at: new Date().toISOString() },
      { onConflict: 'buyer_id,deal_id', ignoreDuplicates: false },
    )
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

module.exports = router
