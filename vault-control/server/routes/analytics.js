import express from 'express'
import { query } from '../database/connection.js'

const router = express.Router()

// GET /api/analytics/posts-summary
// Live post pipeline status: snapshot counts + 7-day trend
// Auth is handled globally by index.js — all authenticated users can view
router.get('/posts-summary', async (req, res) => {
  try {
    const snap = await query(`
      SELECT
        CASE
          WHEN status IN ('scheduled','pending_approval','draft','publishing') THEN 'pending'
          WHEN status = 'published' THEN 'posted'
          WHEN status = 'failed' THEN 'rejected'
          WHEN status = 'approved' THEN 'approved_awaiting_post'
          ELSE 'other'
        END AS bucket,
        COUNT(*)::int AS count
      FROM scheduled_posts
      GROUP BY bucket
    `)

    const trendRows = await query(`
      SELECT
        DATE(created_at) AS day,
        CASE
          WHEN status IN ('scheduled','pending_approval','draft','publishing') THEN 'pending'
          WHEN status = 'published' THEN 'posted'
          WHEN status = 'failed' THEN 'rejected'
          WHEN status = 'approved' THEN 'approved_awaiting_post'
          ELSE 'other'
        END AS bucket,
        COUNT(*)::int AS count
      FROM scheduled_posts
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day, bucket
      ORDER BY day ASC
    `)

    const buckets = { posted: 0, pending: 0, rejected: 0, approved_awaiting_post: 0 }
    for (const r of snap.rows) {
      if (r.bucket in buckets) buckets[r.bucket] = r.count
    }

    const trendMap = {}
    for (const r of trendRows.rows) {
      const dayStr = typeof r.day === 'string' ? r.day.slice(0, 10) : r.day.toISOString().slice(0, 10)
      if (!trendMap[dayStr]) trendMap[dayStr] = { date: dayStr, posted: 0, pending: 0, rejected: 0, approved_awaiting_post: 0 }
      if (r.bucket in trendMap[dayStr]) trendMap[dayStr][r.bucket] = r.count
    }

    const trend = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      trend.push(trendMap[key] || { date: key, posted: 0, pending: 0, rejected: 0, approved_awaiting_post: 0 })
    }

    res.json({ snapshot: buckets, trend, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[Analytics] posts-summary:', err.message)
    res.status(500).json({ error: 'Failed to get post analytics', message: err.message })
  }
})

export default router
