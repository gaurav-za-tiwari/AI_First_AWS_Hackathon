'use strict';
/**
 * server/routes/users.js
 * All ID columns are NVARCHAR(100) strings:
 *   - users.id, user_view_access.user_id / view_id
 * UUIDs are generated with randomUUID() on POST.
 * No parseInt() / +id coercions anywhere.
 * updated_at is handled by the trg_users_updated_at trigger — not set here.
 * created_at has a DB default — not inserted here.
 */
const express        = require('express');
const router         = express.Router();
const bcrypt         = require('bcryptjs');
const { randomUUID } = require('crypto');
const { query, execute } = require('../db/connection');
const auth = require('../middleware/auth');

function requireAdminOrSupervisor(req, res, next) {
  if (!['admin', 'supervisor'].includes(req.user?.role))
    return res.status(403).json({ error: 'Insufficient permissions' });
  next();
}

// GET /api/users
router.get('/', auth, requireAdminOrSupervisor, async (req, res) => {
  try {
    const users = await query(
      `SELECT u.id, u.name, u.username, u.email, u.role, u.[group],
              u.business_unit, u.view_id, u.active, u.last_login, u.created_at,
              STRING_AGG(uva.view_id, ',') AS view_ids
       FROM users u
       LEFT JOIN user_view_access uva ON uva.user_id = u.id
       GROUP BY u.id, u.name, u.username, u.email, u.role, u.[group],
                u.business_unit, u.view_id, u.active, u.last_login, u.created_at
       ORDER BY u.name`
    );

    return res.json(users.map(u => ({
      ...u,
      password_hash: undefined,
      // view_ids are NVARCHAR strings — keep as string array
      allowedViews: u.view_ids ? u.view_ids.split(',') : [],
    })));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/users
router.post('/', auth, requireAdminOrSupervisor, async (req, res) => {
  try {
    const {
      name, username, email, password, role,
      group, business_unit, view_id, active = 1, allowedViews = [],
    } = req.body;

    if (!name || !username || !email || !password || !role)
      return res.status(400).json({ error: 'name, username, email, password, role are required' });

    const pwHash = await bcrypt.hash(password, 12);
    // id is NVARCHAR(100) — generate UUID, not IDENTITY
    const userId = randomUUID();

    // created_at and updated_at are NOT inserted — they use DB defaults / trigger
    await execute(
      `INSERT INTO users
         (id, name, username, email, password_hash, role, [group], business_unit, view_id, active)
       VALUES
         (@id, @name, @username, @email, @hash, @role, @grp, @bu, @vid, @active)`,
      {
        id:     userId,
        name,
        username,
        email,
        hash:   pwHash,
        role,
        grp:    group         || null,
        bu:     business_unit || null,
        vid:    view_id       || null,   // NVARCHAR(100) string
        active: active ? 1 : 0,
      }
    );

    // user_view_access — both user_id and view_id are NVARCHAR(100)
    for (const vid of allowedViews) {
      await execute(
        `IF NOT EXISTS (
           SELECT 1 FROM user_view_access
           WHERE user_id = @uid AND view_id = @vid
         )
         INSERT INTO user_view_access (user_id, view_id) VALUES (@uid, @vid)`,
        { uid: userId, vid }
      );
    }

    return res.status(201).json({ id: userId, message: 'User created' });
  } catch (err) {
    if (err.number === 2627 || err.number === 2601 || err.message?.includes('UNIQUE'))
      return res.status(409).json({ error: 'Username or email already exists' });
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', auth, requireAdminOrSupervisor, async (req, res) => {
  try {
    const rows = await query(
      `SELECT u.id, u.name, u.username, u.email, u.role, u.[group],
              u.business_unit, u.view_id, u.active, u.last_login, u.created_at,
              STRING_AGG(uva.view_id, ',') AS view_ids
       FROM users u
       LEFT JOIN user_view_access uva ON uva.user_id = u.id
       WHERE u.id = @id
       GROUP BY u.id, u.name, u.username, u.email, u.role, u.[group],
                u.business_unit, u.view_id, u.active, u.last_login, u.created_at`,
      { id: req.params.id }   // NVARCHAR string — no +req.params.id
    );

    if (!rows.length)
      return res.status(404).json({ error: 'User not found' });

    const u = rows[0];
    return res.json({
      ...u,
      password_hash: undefined,
      allowedViews: u.view_ids ? u.view_ids.split(',') : [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id
router.put('/:id', auth, requireAdminOrSupervisor, async (req, res) => {
  try {
    const {
      name, email, role, group, business_unit,
      view_id, active, password, allowedViews,
    } = req.body;

    const setClauses = [];
    const params     = { id: req.params.id };   // NVARCHAR string

    if (name          !== undefined) { setClauses.push('name = @name');          params.name   = name; }
    if (email         !== undefined) { setClauses.push('email = @email');        params.email  = email; }
    if (role          !== undefined) { setClauses.push('role = @role');          params.role   = role; }
    if (group         !== undefined) { setClauses.push('[group] = @grp');        params.grp    = group         || null; }
    if (business_unit !== undefined) { setClauses.push('business_unit = @bu');   params.bu     = business_unit || null; }
    if (view_id       !== undefined) { setClauses.push('view_id = @vid');        params.vid    = view_id       || null; }
    if (active        !== undefined) { setClauses.push('active = @active');      params.active = active ? 1 : 0; }
    if (password)                    { setClauses.push('password_hash = @hash'); params.hash   = await bcrypt.hash(password, 12); }

    if (setClauses.length) {
      // updated_at is managed by trg_users_updated_at trigger — do NOT set it here
      await execute(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = @id`,
        params
      );
    }

    // Rebuild view access — both columns are NVARCHAR(100)
    if (Array.isArray(allowedViews)) {
      await execute(
        'DELETE FROM user_view_access WHERE user_id = @id',
        { id: req.params.id }
      );
      for (const vid of allowedViews) {
        await execute(
          'INSERT INTO user_view_access (user_id, view_id) VALUES (@uid, @vid)',
          { uid: req.params.id, vid }
        );
      }
    }

    return res.json({ message: 'User updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/toggle
router.patch('/:id/toggle', auth, requireAdminOrSupervisor, async (req, res) => {
  try {
    await execute(
      `UPDATE users
       SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END
       WHERE id = @id`,
      { id: req.params.id }   // NVARCHAR string
    );
    return res.json({ message: 'Toggled' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', auth, requireAdminOrSupervisor, async (req, res) => {
  try {
    // Both are UUID strings — use string equality, not ===  with parseInt
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: 'Cannot delete your own account' });

    await execute('DELETE FROM users WHERE id = @id', { id: req.params.id });
    return res.json({ message: 'User deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
