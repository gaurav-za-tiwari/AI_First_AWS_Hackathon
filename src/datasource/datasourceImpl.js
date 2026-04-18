/**
 * datasource/datasourceImpl.js
 *
 * Runtime switch between mock and live Azure SQL (via Express API).
 *
 *   REACT_APP_DATASOURCE=mock       → all data served from in-memory mockDataSource
 *   REACT_APP_DATASOURCE=azure-sql  → calls Express/Azure SQL backend on port 4000
 *
 * Both modules export identical function signatures — no other file changes needed.
 */
import * as mockDS from './mockDataSource';
import * as apiDS  from './apiDataSource';

const impl = process.env.REACT_APP_DATASOURCE === 'azure-sql' ? apiDS : mockDS;

export const login             = impl.login;
export const getViews          = impl.getViews;
export const getAllViews        = impl.getAllViews;
export const getAlerts         = impl.getAlerts;
export const getAlertById      = impl.getAlertById;
export const updateAlertStatus = impl.updateAlertStatus;
export const getAuditLog       = impl.getAuditLog;
export const getWorkflow       = impl.getWorkflow;
export const getUsers          = impl.getUsers;
export const createUser        = impl.createUser;
export const updateUser        = impl.updateUser;
export const toggleUserActive  = impl.toggleUserActive;
export const deleteUser        = impl.deleteUser;
