const express = require('express')
const router = express.Router()
const supabase = require('../db')

// Get all tasks
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recurring_tasks')
      .select('*, properties(address)')
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Complete a task with confirmation number
router.put('/:id/complete', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recurring_tasks')
      .update({
        status: 'completed',
        confirmation_number: req.body.confirmation_number,
        completed_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
    if (error) throw error
    res.json(data[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

module.exports = router