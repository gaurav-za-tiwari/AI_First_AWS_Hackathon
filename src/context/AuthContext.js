import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as ds from '../datasource';

const AuthContext = createContext(null);

export const ROLE_PERMISSIONS = {
  admin:      { canView:true,  canEdit:true,  canTransition:true,  canAssign:true,  canManageUsers:true,  canViewAll:true  },
  supervisor: { canView:true,  canEdit:true,  canTransition:true,  canAssign:true,  canManageUsers:false, canViewAll:true  },
  analyst:    { canView:true,  canEdit:true,  canTransition:true,  canAssign:false, canManageUsers:false, canViewAll:false },
  readonly:   { canView:true,  canEdit:false, canTransition:false, canAssign:false, canManageUsers:false, canViewAll:true  },
};

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // Restore session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('aml_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch {}
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username, password) => {
    setError('');
    try {
      const { user: u, token } = await ds.login(username, password);
      sessionStorage.setItem('aml_user', JSON.stringify(u));
      if (token && token !== `mock-token-${u.id}`) {
        localStorage.setItem('aml_token', token);
      }
      setUser(u);
      return true;
    } catch (e) {
      setError(typeof e === 'string' ? e : e.message || 'Login failed');
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('aml_user');
    localStorage.removeItem('aml_token');
    setUser(null);
  }, []);

  const permissions = user ? (ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.readonly) : {};

  return (
    <AuthContext.Provider value={{ user, loading, error, setError, login, logout, permissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
