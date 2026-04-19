/**
 * src/datasource/datasourceImpl.js
 * Routes all datasource calls to either the mock or the live Azure SQL API.
 *
 *   REACT_APP_DATASOURCE=mock       → mockDataSource (in-memory, no server)
 *   REACT_APP_DATASOURCE=azure-sql  → apiDataSource  (Express → Azure SQL)
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
