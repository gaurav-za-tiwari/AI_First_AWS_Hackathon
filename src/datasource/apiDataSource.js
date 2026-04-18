/**
 * apiDataSource.js
 * Live implementation — calls the Python FastAPI backend (uvicorn api.main:app --port 4000).
 * Activated when REACT_APP_DATASOURCE=mysql in .env
 */
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach JWT to every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('aml_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Global 401 handler
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('aml_token');
      window.location.href = '/';
    }
    return Promise.reject(err.response?.data?.error || err.message);
  }
);

export async function login(username, password) {
  const { data } = await api.post('/auth/login', { username, password });
  localStorage.setItem('aml_token', data.token);
  return data;
}

export async function getViews(user) {
  const { data } = await api.get('/views');
  return data;
}

export async function getAllViews() {
  const { data } = await api.get('/views/all');
  return data;
}

export async function getAlerts(params) {
  const { data } = await api.get('/alerts', { params });
  return data;
}

export async function getAlertById(alertId) {
  const { data } = await api.get(`/alerts/${alertId}`);
  return data;
}

export async function updateAlertStatus(alertId, payload) {
  const { data } = await api.patch(`/alerts/${alertId}/status`, payload);
  return data;
}

export async function getAuditLog(alertId) {
  const { data } = await api.get(`/alerts/${alertId}/audit`);
  return data;
}

export async function getWorkflow(alertTypeId) {
  // Python returns { transitions: { "Open": ["In Review"], ... } }
  const { data } = await api.get(`/views/workflow/${alertTypeId}`);
  return data.transitions || data;
}

export async function getUsers() {
  const { data } = await api.get('/users');
  return data;
}

export async function createUser(userData) {
  const { data } = await api.post('/users', userData);
  return data;
}

export async function updateUser(id, userData) {
  const { data } = await api.put(`/users/${id}`, userData);
  return data;
}

export async function toggleUserActive(id) {
  const { data } = await api.patch(`/users/${id}/toggle`);
  return data;
}

export async function deleteUser(id) {
  const { data } = await api.delete(`/users/${id}`);
  return data;
}
