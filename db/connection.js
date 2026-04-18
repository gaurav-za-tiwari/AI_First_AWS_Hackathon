/**
 * db/connection.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Azure SQL Server connection pool using the `mssql` npm package.
 * All credentials are loaded from .env — never hardcoded here.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 *  T-SQL DDL  —  run once against your Azure SQL database
 *  (Azure Portal → Query Editor, or Azure Data Studio, or sqlcmd)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * -- ── Views ────────────────────────────────────────────────────────────────
 * CREATE TABLE views (
 *   view_id    INT           IDENTITY(1,1) PRIMARY KEY,
 *   view_name  NVARCHAR(100) NOT NULL,
 *   active     BIT           NOT NULL DEFAULT 1,
 *   created_at DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
 *   updated_at DATETIME2     NOT NULL DEFAULT GETUTCDATE()
 * );
 *
 * -- ── Roles ─────────────────────────────────────────────────────────────────
 * CREATE TABLE roles (
 *   id               INT           IDENTITY(1,1) PRIMARY KEY,
 *   role_name        NVARCHAR(50)  NOT NULL UNIQUE,
 *   can_view         BIT           NOT NULL DEFAULT 1,
 *   can_edit         BIT           NOT NULL DEFAULT 0,
 *   can_transition   BIT           NOT NULL DEFAULT 0,
 *   can_assign       BIT           NOT NULL DEFAULT 0,
 *   can_manage_users BIT           NOT NULL DEFAULT 0,
 *   can_view_all     BIT           NOT NULL DEFAULT 0,
 *   created_at       DATETIME2     NOT NULL DEFAULT GETUTCDATE()
 * );
 *
 * INSERT INTO roles (role_name,can_view,can_edit,can_transition,can_assign,can_manage_users,can_view_all)
 * VALUES
 *   ('admin',      1,1,1,1,1,1),
 *   ('supervisor', 1,1,1,1,0,1),
 *   ('analyst',    1,1,1,0,0,0),
 *   ('readonly',   1,0,0,0,0,1);
 *
 * -- ── Users ─────────────────────────────────────────────────────────────────
 * CREATE TABLE users (
 *   id            INT            IDENTITY(1,1) PRIMARY KEY,
 *   name          NVARCHAR(150)  NOT NULL,
 *   username      NVARCHAR(80)   NOT NULL UNIQUE,
 *   email         NVARCHAR(150)  NOT NULL UNIQUE,
 *   password_hash NVARCHAR(255)  NOT NULL,
 *   role          NVARCHAR(50)   NOT NULL DEFAULT 'analyst',
 *   [group]       NVARCHAR(100)  NULL,
 *   business_unit NVARCHAR(100)  NULL,
 *   view_id       INT            NULL REFERENCES views(view_id),
 *   active        BIT            NOT NULL DEFAULT 1,
 *   last_login    DATETIME2      NULL,
 *   created_at    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
 *   updated_at    DATETIME2      NOT NULL DEFAULT GETUTCDATE()
 * );
 *
 * -- ── User ↔ View access (many-to-many) ─────────────────────────────────────
 * CREATE TABLE user_view_access (
 *   user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *   view_id INT NOT NULL REFERENCES views(view_id) ON DELETE CASCADE,
 *   PRIMARY KEY (user_id, view_id)
 * );
 *
 * -- ── Alerts ─────────────────────────────────────────────────────────────────
 * CREATE TABLE alerts (
 *   id              INT             IDENTITY(1,1) PRIMARY KEY,
 *   business_unit   NVARCHAR(100)   NULL,
 *   view_id         INT             NOT NULL REFERENCES views(view_id),
 *   Alert_ID        NVARCHAR(50)    NOT NULL UNIQUE,
 *   Customer_ID     NVARCHAR(50)    NULL,
 *   Customer_Name   NVARCHAR(150)   NULL,
 *   Alert_Type      NVARCHAR(100)   NULL,
 *   Alert_Type_ID   INT             NULL,
 *   Score           INT             NULL,
 *   Status          NVARCHAR(50)    NULL DEFAULT 'Open',
 *   Assigned_To     NVARCHAR(80)    NULL,
 *   Created_Date    DATE            NULL,
 *   Amount          DECIMAL(18,2)   NULL,
 *   Currency        NCHAR(3)        NULL,
 *   Country         NCHAR(3)        NULL,
 *   Description     NVARCHAR(MAX)   NULL,
 *   Priority        NVARCHAR(20)    NULL,
 *   Action          NVARCHAR(100)   NULL,
 *   Closure_Comment NVARCHAR(MAX)   NULL,
 *   Risk_Flags      NVARCHAR(MAX)   NULL,   -- stored as JSON string
 *   Processed_At    DATETIME2       NULL,
 *   created_at      DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
 *   updated_at      DATETIME2       NOT NULL DEFAULT GETUTCDATE()
 * );
 *
 * -- ── Workflow config ─────────────────────────────────────────────────────────
 * CREATE TABLE workflow_config (
 *   id              INT           IDENTITY(1,1) PRIMARY KEY,
 *   alert_type_id   INT           NOT NULL,
 *   alert_type_name NVARCHAR(100) NULL,
 *   source_step     NVARCHAR(50)  NOT NULL,
 *   target_step     NVARCHAR(50)  NOT NULL,
 *   CONSTRAINT uq_transition UNIQUE (alert_type_id, source_step, target_step)
 * );
 *
 * -- ── Audit log ───────────────────────────────────────────────────────────────
 * CREATE TABLE audit_log (
 *   id          INT            IDENTITY(1,1) PRIMARY KEY,
 *   alert_id    NVARCHAR(50)   NOT NULL,
 *   user_id     INT            NULL REFERENCES users(id),
 *   from_status NVARCHAR(50)   NULL,
 *   to_status   NVARCHAR(50)   NULL,
 *   comment     NVARCHAR(MAX)  NULL,
 *   action_type NVARCHAR(50)   NULL DEFAULT 'TRANSITION',
 *   created_at  DATETIME2      NOT NULL DEFAULT GETUTCDATE()
 * );
 *
 * -- ── Trigger: update updated_at on alerts ────────────────────────────────────
 * CREATE TRIGGER trg_alerts_updated_at
 * ON alerts AFTER UPDATE AS
 * BEGIN
 *   SET NOCOUNT ON;
 *   UPDATE alerts SET updated_at = GETUTCDATE()
 *   FROM alerts a INNER JOIN inserted i ON a.id = i.id;
 * END;
 *
 * -- ── Trigger: update updated_at on users ─────────────────────────────────────
 * CREATE TRIGGER trg_users_updated_at
 * ON users AFTER UPDATE AS
 * BEGIN
 *   SET NOCOUNT ON;
 *   UPDATE users SET updated_at = GETUTCDATE()
 *   FROM users u INNER JOIN inserted i ON u.id = i.id;
 * END;
 *
 * ═════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sql = require('mssql');

// ── Connection pool config ─────────────────────────────────────────────────
const poolConfig = {
  server:   process.env.DB_SERVER,   // e.g. yourserver.database.windows.net
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt:                true,   // Required for Azure SQL
    trustServerCertificate: false,  // Always false for Azure
    enableArithAbort:       true,
    connectTimeout:         30000,
    requestTimeout:         30000,
  },
  pool: {
    max:               parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
    min:               2,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000,
  },
};

let _pool = null;

/**
 * Returns the singleton connection pool.
 * Creates it on first call.
 */
async function getPool() {
  if (!_pool) {
    _pool = await sql.connect(poolConfig);
    _pool.on('error', (err) => {
      console.error('SQL pool error:', err);
      _pool = null; // allow reconnect on next call
    });
  }
  return _pool;
}

/**
 * Execute a parameterised query.
 *
 * @param {string} queryStr - T-SQL query string. Use @paramName placeholders.
 * @param {Object} params   - { paramName: { type: sql.NVarChar, value: 'x' } }
 *                            OR shorthand { paramName: value } (type inferred).
 * @returns {Promise<sql.IRecordSet>}  rows array
 */
async function query(queryStr, params = {}) {
  const pool    = await getPool();
  const request = pool.request();
  _bindParams(request, params);
  const result = await request.query(queryStr);
  return result.recordset;
}

/**
 * Execute an INSERT/UPDATE/DELETE.
 * Returns { rowsAffected, returnValue } where returnValue carries OUTPUT values.
 */
async function execute(queryStr, params = {}) {
  const pool    = await getPool();
  const request = pool.request();
  _bindParams(request, params);
  const result = await request.query(queryStr);
  return {
    rowsAffected: result.rowsAffected?.[0] ?? 0,
    returnValue:  result.returnValue,
    recordset:    result.recordset,       // for OUTPUT clauses
  };
}

/**
 * Bind a params object onto a Request.
 * Accepts two forms:
 *   { username: 'admin' }                          — type inferred from value
 *   { username: { type: sql.NVarChar(80), value: 'admin' } }  — explicit type
 */
function _bindParams(request, params) {
  for (const [key, val] of Object.entries(params)) {
    if (val !== null && typeof val === 'object' && 'type' in val && 'value' in val) {
      request.input(key, val.type, val.value);
    } else {
      // Infer type
      if (val === null || val === undefined) {
        request.input(key, sql.NVarChar, null);
      } else if (typeof val === 'number' && Number.isInteger(val)) {
        request.input(key, sql.Int, val);
      } else if (typeof val === 'number') {
        request.input(key, sql.Decimal(18, 2), val);
      } else if (typeof val === 'boolean') {
        request.input(key, sql.Bit, val ? 1 : 0);
      } else if (val instanceof Date) {
        request.input(key, sql.DateTime2, val);
      } else {
        request.input(key, sql.NVarChar(sql.MAX), String(val));
      }
    }
  }
}

/**
 * Build a safe IN-list clause for an array of IDs (integers or NVARCHAR strings).
 * Returns an object with { clause, params } ready to spread into query params.
 *
 * Example:
 *   const { clause, params } = buildInClause('view_id', [1, 2, 3], 'v');
 *   // clause = 'a.view_id IN (@v0, @v1, @v2)'
 *   // params = { v0: 1, v1: 2, v2: 3 }
 */
function buildInClause(column, ids, prefix = 'id') {
  const paramNames = ids.map((_, i) => `@${prefix}${i}`);
  const clause = `${column} IN (${paramNames.join(', ')})`;
  const params = {};
  ids.forEach((id, i) => { params[`${prefix}${i}`] = id; });
  return { clause, params };
}

async function testConnection() {
  try {
    await query('SELECT 1 AS ok');
    console.log('✅  Azure SQL connection pool established');
    return true;
  } catch (err) {
    console.error('❌  Azure SQL connection failed:', err.message);
    return false;
  }
}

module.exports = { sql, getPool, query, execute, buildInClause, testConnection };
