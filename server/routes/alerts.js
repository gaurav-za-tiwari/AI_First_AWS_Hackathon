'use strict';
/**
 * server/routes/alerts.js
 * alerts.view_id is NVARCHAR(100) — all view_id params kept as strings.
 * audit_log.id is NVARCHAR(100) — UUID generated per INSERT.
 */
const express    = require('express');
const router     = express.Router();
const { randomUUID } = require('crypto');
const { query, execute, buildInClause } = require('../db/connection');
const auth = require('../middleware/auth');

const SORTABLE = new Set([
  'Score','Status','Priority','Created_Date','Amount','Alert_ID','Customer_Name',
]);

// GET /api/alerts
router.get('/', auth, async (req, res) => {
  try {
    const {
      view_id, status, priority, search,
      page  = 1,
      limit = 20,
      sort  = 'Score',
      dir   = 'DESC',
    } = req.query;

    const user         = req.user;
    const allowedViews = user.allowedViews || [];

    if (!allowedViews.length)
      return res.json({ alerts: [], total: 0, page: +page, limit: +limit });

    // allowedViews is a string array — buildInClause handles NVarChar inference
    const { clause: inClause, params: inParams } =
      buildInClause('a.view_id', allowedViews, 'av');

    const conditions = [inClause];
    const params     = { ...inParams };

    if (view_id) {
      // view_id is NVARCHAR(100) — keep as string
      conditions.push('a.view_id = @view_id');
      params.view_id = String(view_id);
    }

    // Analysts only see alerts assigned to them
    if (user.role === 'analyst') {
      conditions.push('a.Assigned_To = @assignedTo');
      params.assignedTo = user.username;
    }

    if (status) {
      conditions.push('a.Status = @status');
      params.status = status;
    }

    if (priority) {
      conditions.push('a.Priority = @priority');
      params.priority = priority;
    }

    if (search) {
      conditions.push(
        `(a.Alert_ID LIKE @search OR a.Customer_Name LIKE @search
          OR a.Description LIKE @search OR a.Alert_Type LIKE @search)`
      );
      params.search = `%${search}%`;
    }

    const where    = conditions.join(' AND ');
    const safeSort = SORTABLE.has(sort) ? sort : 'Score';
    const safeDir  = dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset   = (Number(page) - 1) * Number(limit);

    // Azure SQL pagination: OFFSET … FETCH NEXT … ROWS ONLY
    const [alerts, totals] = await Promise.all([
      query(
        `SELECT a.*, v.view_name
         FROM alerts a
         JOIN views v ON v.view_id = a.view_id
         WHERE ${where}
         ORDER BY a.${safeSort} ${safeDir}
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        { ...params, offset, limit: +limit }
      ),
      query(
        `SELECT COUNT(*) AS total FROM alerts a WHERE ${where}`,
        params
      ),
    ]);

    return res.json({
      alerts,
      total: totals[0]?.total ?? 0,
      page:  +page,
      limit: +limit,
    });
  } catch (err) {
    console.error('GET /alerts error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/alerts/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM alerts WHERE Alert_ID = @alertId',
      { alertId: req.params.id }
    );
    if (!rows.length) return res.status(404).json({ error: 'Alert not found' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/alerts/:id/status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status, comment, action, fromStatus } = req.body;
    if (!status) return res.status(400).json({ error: 'Status required' });

    await execute(
      `UPDATE alerts
       SET Status          = @status,
           Action          = @action,
           Closure_Comment = @comment,
           Processed_At    = GETUTCDATE()
       WHERE Alert_ID = @alertId`,
      { status, action: action || null, comment: comment || null, alertId: req.params.id }
    );

    // audit_log.id is NVARCHAR(100) — generate UUID
    // audit_log.user_id is NVARCHAR(100) — user.id is already a UUID string
    await execute(
      `INSERT INTO audit_log (id, alert_id, user_id, from_status, to_status, comment, action_type)
       VALUES (@id, @alertId, @userId, @fromStatus, @toStatus, @comment, 'TRANSITION')`,
      {
        id:         randomUUID(),
        alertId:    req.params.id,
        userId:     req.user.id,
        fromStatus: fromStatus || null,
        toStatus:   status,
        comment:    comment || null,
      }
    );

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/alerts/:id/audit
router.get('/:id/audit', auth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT al.*, u.name AS user_name
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.alert_id = @alertId
       ORDER BY al.created_at DESC`,
      { alertId: req.params.id }
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
