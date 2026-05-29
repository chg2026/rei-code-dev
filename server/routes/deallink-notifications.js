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
    const { data, error } = await supabaseAdmin
      .from('deallink_notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) throw error
    res.json(data)
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
