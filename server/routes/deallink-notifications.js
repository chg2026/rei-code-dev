const { Router } = require('express')
const { requireAuth } = require('../middleware/auth')
const { supabaseAdmin } = require('../middleware/auth')
const { getUnreadCount } = require('../services/notifications')

const router = Router()

// GET /api/deallink/notifications/unread-count
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const count = await getUnreadCount(req.user.id)
    res.json({ count })
  } catch (err) {
    console.error('[deallink-notifications/unread-count] Error:', err.message)
    res.status(500).json({ error: 'Failed to fetch unread count.' })
  }
})

// GET /api/deallink/notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    // Fetch last 200 raw notifications (enough to group meaningfully)
    const { data, error } = await supabaseAdmin
      .from('deallink_notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error
    const rows = data || []

    // Types that are NEVER grouped — always show individually
    const INDIVIDUAL_TYPES = ['offer_received', 'contract_deadline']

    const grouped = []
    const seenGroupKeys = new Map()

    for (const row of rows) {
      const type = row.type

      if (INDIVIDUAL_TYPES.includes(type)) {
        // Always push as individual item
        grouped.push({ ...row, count: 1, grouped: false })
        continue
      }

      // For groupable types, key is type + deal_id (if present)
      const dealId = row.metadata?.deal_id || null
      const groupKey = dealId ? `${type}::${dealId}` : type

      if (seenGroupKeys.has(groupKey)) {
        const existing = seenGroupKeys.get(groupKey)
        existing.count += 1
        // Keep most recent timestamp
        if (new Date(row.created_at) > new Date(existing.created_at)) {
          existing.created_at = row.created_at
        }
        // If any row in the group is unread, the group is unread
        if (!row.read) existing.read = false
        // Accumulate viewer names for richer body
        if (row.metadata?.buyer_name && existing._names && existing._names.length < 3) {
          existing._names.push(row.metadata.buyer_name)
        }
      } else {
        const item = {
          ...row,
          count: 1,
          grouped: true,
          _names: row.metadata?.buyer_name ? [row.metadata.buyer_name] : [],
        }
        seenGroupKeys.set(groupKey, item)
        grouped.push(item)
      }
    }

    // Build human-readable titles/bodies based on group count
    const result = grouped.map((item) => {
      if (!item.grouped) return item  // individual — return as-is

      const n = item.count
      const addr = item.metadata?.deal_address || item.metadata?.deal_addr || null
      const names = item._names || []
      delete item._names

      if (item.type === 'deal_viewed') {
        item.title = n === 1
          ? `Someone viewed your deal`
          : `${n} people viewed your deal`
        item.body = addr
          ? (n === 1 ? `${names[0] || 'A buyer'} viewed ${addr}` : `${addr} — ${n} views`)
          : `${n} view${n > 1 ? 's' : ''} on your listing`
      } else if (item.type === 'new_lead') {
        item.title = n === 1 ? `New buyer joined your list` : `${n} new buyers joined your list`
        item.body = n === 1
          ? `${names[0] || 'A buyer'} joined your buyer list`
          : names.length > 0
            ? `Including ${names.slice(0, 2).join(', ')}${names.length < n ? ` and ${n - names.length} more` : ''}`
            : `${n} buyers joined`
      }

      return item
    })

    // Limit final response to 20 grouped items
    res.json(result.slice(0, 20))
  } catch (err) {
    console.error('[deallink-notifications/list] Error:', err.message)
    res.status(500).json({ error: 'Failed to fetch notifications.' })
  }
})

// POST /api/deallink/notifications/mark-all-read
router.post('/mark-all-read', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('deallink_notifications')
      .update({ read: true })
      .eq('user_id', req.user.id)
      .eq('read', false)

    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    console.error('[deallink-notifications/mark-all-read] Error:', err.message)
    res.status(500).json({ error: 'Failed to mark notifications as read.' })
  }
})

module.exports = router
