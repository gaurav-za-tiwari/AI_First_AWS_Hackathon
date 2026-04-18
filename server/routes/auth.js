'use strict';
/**
 * server/routes/auth.js
 *
 * Updated to match schema changes:
 *   - users.id      → NVARCHAR(100) UUID string (not INT)
 *   - view_ids      → NVARCHAR(100) strings — no .map(Number)
 *   - allowedViews  → string array in JWT payload
 */
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { query, execute } = require('../db/connection');
const auth = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    // Fetch user + allowed view IDs in one query using STRING_AGG
    // Both users.id and user_view_access.view_id are NVARCHAR(100)
    const rows = await query(
      `SELECT u.id, u.name, u.username, u.email, u.role, u.[group],
              u.business_unit, u.view_id, u.active, u.last_login,
              u.password_hash,
              STRING_AGG(uva.view_id, ',') AS view_ids
       FROM users u
       LEFT JOIN user_view_access uva ON uva.user_id = u.id
       WHERE u.username = @username AND u.active = 1
       GROUP BY u.id, u.name, u.username, u.email, u.role, u.[group],
                u.business_unit, u.view_id, u.active, u.last_login, u.password_hash`,
      { username }
    );

    if (!rows.length)
      return res.status(401).json({ error: 'Invalid credentials' });

    const user  = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Invalid credentials' });

    // Update last_login — id is NVARCHAR(100), pass as string
    await execute(
      'UPDATE users SET last_login = GETUTCDATE() WHERE id = @id',
      { id: user.id }
    );

    // view_ids are NVARCHAR(100) strings — keep as strings, no parseInt/map(Number)
    const allowedViews = user.view_ids
      ? user.view_ids.split(',')
      : [];

    const payload = {
      id:            user.id,       // UUID string e.g. "a1b2c3d4-..."
      username:      user.username,
      name:          user.name,
      email:         user.email,
      role:          user.role,
      group:         user.group,
      business_unit: user.business_unit,
      allowedViews,                 // string array e.g. ["PARTY_IB", "PARTY_WMA"]
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    return res.json({ token, user: payload });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => res.json({ user: req.user }));

module.exports = router;
