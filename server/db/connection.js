'use strict';
/**
 * server/db/connection.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Azure SQL Server connection pool using the `mssql` npm package.
 * All credentials loaded from .env — never hardcoded here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  T-SQL DDL — run once in Azure Data Studio or Azure Portal Query Editor
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * -- ── views ─────────────────────────────────────────────────────────────
 * CREATE TABLE [dbo].[views] (
 *   [view_id]   NVARCHAR(100) NOT NULL PRIMARY KEY,
 *   [view_name] NVARCHAR(100) NOT NULL,
 *   [active]    BIT           NOT NULL DEFAULT 1,
 *   [created_at] DATETIME2   NOT NULL DEFAULT GETUTCDATE(),
 *   [updated_at] DATETIME2   NOT NULL DEFAULT GETUTCDATE()
 * );
 *
 * -- ── roles ──────────────────────────────────────────────────────────────
 * CREATE TABLE [dbo].[roles] (
 *   [id]               NVARCHAR(100) NOT NULL PRIMARY KEY,
 *   [role_name]        NVARCHAR(50)  NOT NULL UNIQUE,
 *   [can_view]         BIT NOT NULL DEFAULT 1,
 *   [can_edit]         BIT NOT NULL DEFAULT 0,
 *   [can_transition]   BIT NOT NULL DEFAULT 0,
 *   [can_assign]       BIT NOT NULL DEFAULT 0,
 *   [can_manage_users] BIT NOT NULL DEFAULT 0,
 *   [can_view_all]     BIT NOT NULL DEFAULT 0,
 *   [created_at]       DATETIME2 NOT NULL DEFAULT GETUTCDATE()
 * );
 *
 * INSERT INTO roles (id,role_name,can_view,can_edit,can_transition,can_assign,can_manage_users,can_view_all)
 * VALUES
 *   (NEWID(),'admin',      1,1,1,1,1,1),
 *   (NEWID(),'supervisor', 1,1,1,1,0,1),
 *   (NEWID(),'analyst',    1,1,1,0,0,0),
 *   (NEWID(),'readonly',   1,0,0,0,0,1);
 *
 * -- ── users ──────────────────────────────────────────────────────────────
 * CREATE TABLE [dbo].[users] (
 *   [id]            NVARCHAR(100) NOT NULL PRIMARY KEY,
 *   [name]          NVARCHAR(150) NOT NULL,
 *   [username]      NVARCHAR(80)  NOT NULL UNIQUE,
 *   [email]         NVARCHAR(150) NOT NULL UNIQUE,
 *   [password_hash] NVARCHAR(255) NOT NULL,
 *   [role]          NVARCHAR(50)  NOT NULL DEFAULT 'analyst',
 *   [group]         NVARCHAR(100) NULL,
 *   [business_unit] NVARCHAR(100) NULL,
 *   [view_id]       NVARCHAR(100) NULL REFERENCES views(view_id),
 *   [active]        BIT           NOT NULL DEFAULT 1,
 *   [last_login]    DATETIME2     NULL,
 *   [created_at]    DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
 *   [updated_at]    DATETIME2     NOT NULL DEFAULT GETUTCDATE()
 * );
 * CREATE TRIGGER [dbo].[trg_users_updated_at] ON [dbo].[users] AFTER UPDATE AS
 * BEGIN SET NOCOUNT ON;
 *   UPDATE users SET updated_at=GETUTCDATE() FROM users u INNER JOIN inserted i ON u.id=i.id;
 * END;
 *
 * -- ── user_view_access ────────────────────────────────────────────────────
 * CREATE TABLE [dbo].[user_view_access] (
 *   [user_id] NVARCHAR(100) NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
 *   [view_id] NVARCHAR(100) NOT NULL REFERENCES views(view_id) ON DELETE CASCADE,
 *   PRIMARY KEY ([user_id],[view_id])
 * );
 *
 * -- ── alerts ──────────────────────────────────────────────────────────────
 * CREATE TABLE [dbo].[alerts] (
 *   [id]              NVARCHAR(100)  NOT NULL PRIMARY KEY,
 *   [business_unit]   NVARCHAR(100)  NULL,
 *   [view_id]         NVARCHAR(100)  NOT NULL REFERENCES views(view_id),
 *   [Alert_ID]        NVARCHAR(50)   NOT NULL UNIQUE,
 *   [Customer_ID]     NVARCHAR(50)   NULL,
 *   [Customer_Name]   NVARCHAR(150)  NULL,
 *   [Alert_Type]      NVARCHAR(100)  NULL,
 *   [Alert_Type_ID]   INT            NULL,
 *   [Score]           INT            NULL,
 *   [Status]          NVARCHAR(50)   NULL DEFAULT 'Open',
 *   [Assigned_To]     NVARCHAR(80)   NULL,
 *   [Created_Date]    DATE           NULL,
 *   [Amount]          DECIMAL(18,2)  NULL,
 *   [Currency]        NCHAR(3)       NULL,
 *   [Country]         NCHAR(3)       NULL,
 *   [Description]     NVARCHAR(MAX)  NULL,
 *   [Priority]        NVARCHAR(20)   NULL,
 *   [Action]          NVARCHAR(100)  NULL,
 *   [Closure_Comment] NVARCHAR(MAX)  NULL,
 *   [Risk_Flags]      NVARCHAR(MAX)  NULL,
 *   [Processed_At]    DATETIME2      NULL,
 *   [created_at]      DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
 *   [updated_at]      DATETIME2      NOT NULL DEFAULT GETUTCDATE()
 * );
 * CREATE TRIGGER [dbo].[trg_alerts_updated_at] ON [dbo].[alerts] AFTER UPDATE AS
 * BEGIN SET NOCOUNT ON;
 *   UPDATE alerts SET updated_at=GETUTCDATE() FROM alerts a INNER JOIN inserted i ON a.id=i.id;
 * END;
 *
 * -- ── workflow_config ─────────────────────────────────────────────────────
 * CREATE TABLE [dbo].[workflow_config] (
 *   [id]              NVARCHAR(100) NOT NULL PRIMARY KEY,
 *   [alert_type_id]   INT           NOT NULL,
 *   [alert_type_name] NVARCHAR(100) NULL,
 *   [source_step]     NVARCHAR(50)  NOT NULL,
 *   [target_step]     NVARCHAR(50)  NOT NULL,
 *   CONSTRAINT [uq_transition] UNIQUE ([alert_type_id],[source_step],[target_step])
 * );
 *
 * -- ── audit_log ───────────────────────────────────────────────────────────
 * CREATE TABLE [dbo].[audit_log] (
 *   [id]          NVARCHAR(100) NOT NULL PRIMARY KEY,
 *   [alert_id]    NVARCHAR(50)  NOT NULL,
 *   [user_id]     NVARCHAR(100) NULL REFERENCES users(id),
 *   [from_status] NVARCHAR(50)  NULL,
 *   [to_status]   NVARCHAR(50)  NULL,
 *   [comment]     NVARCHAR(MAX) NULL,
 *   [action_type] NVARCHAR(50)  NULL DEFAULT 'TRANSITION',
 *   [created_at]  DATETIME2     NOT NULL DEFAULT GETUTCDATE()
 * );
 * ═══════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sql = require('mssql');

const poolConfig = {
  server:   process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt:                true,
    trustServerCertificate: false,
    enableArithAbort:       true,
    connectTimeout:         30000,
    requestTimeout:         30000,
  },
  pool: {
    max:                  parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
    min:                  2,
    idleTimeoutMillis:    30000,
    acquireTimeoutMillis: 30000,
  },
};

let _pool = null;

async function getPool() {
  if (!_pool) {
    _pool = await sql.connect(poolConfig);
    _pool.on('error', (err) => {
      console.error('SQL pool error:', err);
      _pool = null;
    });
  }
  return _pool;
}

/**
 * Execute a SELECT — returns array of row objects.
 * Use @paramName placeholders in your SQL string.
 */
async function query(queryStr, params = {}) {
  const pool    = await getPool();
  const request = pool.request();
  _bindParams(request, params);
  const result = await request.query(queryStr);
  return result.recordset;
}

/**
 * Execute INSERT / UPDATE / DELETE.
 * Returns { rowsAffected, recordset } — recordset carries OUTPUT clause results.
 */
async function execute(queryStr, params = {}) {
  const pool    = await getPool();
  const request = pool.request();
  _bindParams(request, params);
  const result = await request.query(queryStr);
  return {
    rowsAffected: result.rowsAffected?.[0] ?? 0,
    recordset:    result.recordset,
  };
}

/**
 * Bind params onto a mssql Request.
 * Supports two forms:
 *   { key: value }                              — type inferred from JS type
 *   { key: { type: sql.NVarChar(100), value } } — explicit mssql type
 */
function _bindParams(request, params) {
  for (const [key, val] of Object.entries(params)) {
    if (val !== null && val !== undefined && typeof val === 'object' && 'type' in val && 'value' in val) {
      request.input(key, val.type, val.value);
    } else if (val === null || val === undefined) {
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

/**
 * Build a safe IN-list clause for an array of IDs (integers or NVARCHAR strings).
 *
 * Example:
 *   buildInClause('a.view_id', ['PARTY_IB','PARTY_WMA'], 'av')
 *   → { clause: "a.view_id IN (@av0, @av1)", params: { av0:'PARTY_IB', av1:'PARTY_WMA' } }
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
