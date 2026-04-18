'use strict';
const express = require('express');
const router  = express.Router();
const { query, buildInClause } = require('../db/connection');
const auth = require('../middleware/auth');

// GET /api/views  — only views this user can access
router.get('/', auth, async (req, res) => {
  try {
    const allowed = req.user.allowedViews || [];
    if (!allowed.length) return res.json([]);

    const { clause, params } = buildInClause('view_id', allowed, 'v');
    const rows = await query(
      `SELECT * FROM views WHERE ${clause} AND active = 1 ORDER BY view_name`,
      params
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/views/all — all views, for admin forms
router.get('/all', auth, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM views ORDER BY view_name');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/views/workflow/:alertTypeId
router.get('/workflow/:alertTypeId', auth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT source_step, target_step
       FROM workflow_config
       WHERE alert_type_id = @alertTypeId`,
      { alertTypeId: +req.params.alertTypeId }
    );

    // Build { "Open": ["In Review", ...], ... }
    const transitions = {};
    rows.forEach(r => {
      if (!transitions[r.source_step]) transitions[r.source_step] = [];
      transitions[r.source_step].push(r.target_step);
    });

    return res.json(transitions);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
