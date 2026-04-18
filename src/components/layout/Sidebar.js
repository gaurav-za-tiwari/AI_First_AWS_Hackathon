import React, { useState } from 'react';
import { Shield, LayoutDashboard, Users, Settings, LogOut, ChevronRight, Database } from 'lucide-react';
import { theme } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { datasourceMode } from '../../datasource';

const NAV_ITEMS = [
  { id:'workbench', label:'Workbench',       icon:LayoutDashboard, roles:['admin','supervisor','analyst','readonly'] },
  { id:'users',     label:'User Management', icon:Users,           roles:['admin','supervisor'] },
];

export default function Sidebar({ activePage, onNavigate }) {
  const { user, logout, permissions } = useAuth();
  const [hoverId, setHoverId] = useState(null);

  const roleColor = { admin:'#92400E', supervisor:'#5B21B6', analyst:'#1E40AF', readonly:'#374151' }[user?.role] || '#374151';
  const roleBg    = { admin:'#FEF3C7', supervisor:'#EDE9FE', analyst:'#DBEAFE', readonly:'#F3F4F6' }[user?.role] || '#F3F4F6';

  return (
    <aside style={{
      width: theme.layout.sidebarWidth, minHeight:'100vh', background:'#fff',
      borderRight:`1px solid ${theme.color.border}`, display:'flex', flexDirection:'column',
      position:'fixed', left:0, top:0, bottom:0, zIndex:200,
      boxShadow:'2px 0 12px rgba(15,23,42,0.06)',
    }}>
      {/* Logo */}
      <div style={{ padding:'18px 20px', borderBottom:`1px solid ${theme.color.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg,${theme.color.primaryDark},${theme.color.primary})`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(21,101,192,0.35)', flexShrink:0 }}>
            <Shield size={19} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:theme.color.text, letterSpacing:'-0.3px' }}>AML Manager</div>
            <div style={{ fontSize:10, color:theme.color.textMuted, fontFamily:theme.font.mono, letterSpacing:'0.5px' }}>CASE WORKBENCH</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'12px 0', overflowY:'auto' }}>
        <div style={{ padding:'6px 12px 10px', fontSize:10, fontWeight:700, color:theme.color.textMuted, letterSpacing:'1px', textTransform:'uppercase' }}>Navigation</div>
        {NAV_ITEMS.map(item => {
          const allowed = item.roles.includes(user?.role);
          if (!allowed) return null;
          const active  = activePage === item.id;
          const hovered = hoverId === item.id;
          const Icon    = item.icon;
          return (
            <button key={item.id}
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHoverId(item.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{
                width:'100%', display:'flex', alignItems:'center', gap:10,
                padding:'10px 16px', background: active ? theme.color.primaryLight : hovered ? '#F8FAFC' : 'transparent',
                border:'none', cursor:'pointer', textAlign:'left',
                borderLeft:`3px solid ${active ? theme.color.primary : 'transparent'}`,
                transition:theme.transition.fast,
              }}>
              <Icon size={17} color={active ? theme.color.primary : theme.color.textSecondary} />
              <span style={{ fontSize:13, fontWeight: active ? 600 : 500, color: active ? theme.color.primary : theme.color.text, flex:1 }}>{item.label}</span>
              {active && <ChevronRight size={13} color={theme.color.primary} />}
            </button>
          );
        })}
      </nav>

      {/* Datasource indicator */}
      <div style={{ padding:'10px 16px', margin:'0 12px 10px', background: datasourceMode==='mysql' ? '#F0FDF4':'#F8FAFC', border:`1px solid ${datasourceMode==='mysql'?'#BBF7D0':'#E2E8F0'}`, borderRadius:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Database size={12} color={datasourceMode==='mysql'?'#16A34A':'#94A3B8'} />
          <span style={{ fontSize:10, fontWeight:600, color:datasourceMode==='mysql'?'#16A34A':'#94A3B8', fontFamily:theme.font.mono }}>
            {datasourceMode === 'mysql' ? 'MySQL Connected' : 'Mock Mode'}
          </span>
        </div>
      </div>

      {/* User footer */}
      <div style={{ padding:'14px 16px', borderTop:`1px solid ${theme.color.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:`linear-gradient(135deg,${theme.color.primary},${theme.color.accent})`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span style={{ color:'#fff', fontSize:13, fontWeight:700 }}>{user?.name?.charAt(0)}</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:theme.color.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.name}</div>
            <span style={{ display:'inline-block', background:roleBg, color:roleColor, borderRadius:20, padding:'1px 8px', fontSize:10, fontWeight:700 }}>{user?.role}</span>
          </div>
        </div>
        <button onClick={logout}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:8, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'8px 12px', cursor:'pointer', color:'#DC2626', fontSize:12, fontWeight:600, transition:theme.transition.fast }}
          onMouseEnter={e => e.currentTarget.style.background='#FEE2E2'}
          onMouseLeave={e => e.currentTarget.style.background='#FEF2F2'}>
          <LogOut size={13}/> Sign Out
        </button>
      </div>
    </aside>
  );
}
