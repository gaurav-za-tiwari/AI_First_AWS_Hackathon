/**
 * src/datasource/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SWITCH POINT — controls which datasource the entire app uses.
 *
 * Set REACT_APP_DATASOURCE in .env:
 *   mock       → in-memory data, no backend needed  (default)
 *   azure-sql  → calls Express API → Azure SQL Server
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const datasourceMode = process.env.REACT_APP_DATASOURCE || 'mock';

export {
  login,
  getViews,
  getAllViews,
  getAlerts,
  getAlertById,
  updateAlertStatus,
  getAuditLog,
  getWorkflow,
  getUsers,
  createUser,
  updateUser,
  toggleUserActive,
  deleteUser,
} from './datasourceImpl';
