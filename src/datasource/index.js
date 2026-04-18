/**
 * datasource/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE CONFIG POINT — controls the entire data layer.
 *
 * Set REACT_APP_DATASOURCE in .env:
 *   mock       → in-memory data, no backend needed  (default)
 *   azure-sql  → Express API → Azure SQL Server
 *
 * All other source files import from this module only.
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
