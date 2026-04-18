import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/layout/Login';
import Sidebar from './components/layout/Sidebar';
import Workbench from './components/alerts/Workbench';
import UserManagement from './components/users/UserManagement';
import { theme } from './theme';
import { Spinner } from './components/common/UI';

function AppShell() {
  const { user, loading, permissions } = useAuth();
  const [page, setPage] = useState('workbench');

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:theme.color.background }}>
        <Spinner size={36}/>
      </div>
    );
  }

  if (!user) return <Login />;

  const content = {
    workbench: <Workbench />,
    users:     permissions.canManageUsers ? <UserManagement /> : <Workbench />,
  }[page] || <Workbench />;

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:theme.color.background, fontFamily:theme.font.sans }}>
      <Sidebar activePage={page} onNavigate={setPage} />
      <div style={{ marginLeft:theme.layout.sidebarWidth, flex:1, display:'flex', flexDirection:'column', minHeight:'100vh', overflow:'hidden' }}>
        {content}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
