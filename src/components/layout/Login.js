import React, { useState } from 'react';
import { Shield, Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { theme } from '../../theme';
import { Button, Input, Spinner } from '../common/UI';
import { datasourceMode } from '../../datasource';

const DEMO_USERS = [
  { username: 'admin',      password: 'Admin@123',   role: 'Admin',      color: '#92400E', bg: '#FEF3C7' },
  { username: 'supervisor', password: 'Super@123',   role: 'Supervisor', color: '#5B21B6', bg: '#EDE9FE' },
  { username: 'analyst1',   password: 'Analyst@123', role: 'Analyst IB', color: '#1E40AF', bg: '#DBEAFE' },
  { username: 'analyst2',   password: 'Analyst@123', role: 'Analyst WMA',color: '#1E40AF', bg: '#DBEAFE' },
  { username: 'analyst3',   password: 'Analyst@123', role: 'Analyst CB', color: '#1E40AF', bg: '#DBEAFE' },
  { username: 'readonly',   password: 'Read@123',    role: 'Read Only',  color: '#374151', bg: '#F3F4F6' },
];

export default function Login() {
  const { login, error, setError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true);
    await login(username, password);
    setLoading(false);
  };

  const quickLogin = (u) => {
    setUsername(u.username);
    setPassword(u.password);
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh', background: theme.color.background,
      display: 'flex', fontFamily: theme.font.sans,
    }}>
      {/* Left panel — branding */}
      <div style={{
        width: '42%', background: `linear-gradient(145deg, ${theme.color.primaryDark} 0%, ${theme.color.primary} 60%, ${theme.color.accent} 100%)`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position:'absolute', top:-80, right:-80, width:320, height:320, borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-60, left:-60, width:240, height:240, borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:'40%', right:-40, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.05)', pointerEvents:'none' }} />

        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:48 }}>
            <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,0.15)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid rgba(255,255,255,0.2)' }}>
              <Shield size={26} color="#fff" />
            </div>
            <div>
              <div style={{ color:'#fff', fontSize:20, fontWeight:700, letterSpacing:'-0.4px' }}>AML Case Manager</div>
              <div style={{ color:'rgba(255,255,255,0.6)', fontSize:11, letterSpacing:'1.5px', textTransform:'uppercase', fontFamily:theme.font.mono }}>Enterprise Edition</div>
            </div>
          </div>

          <h1 style={{ color:'#fff', fontSize:32, fontWeight:700, lineHeight:1.25, marginBottom:16, letterSpacing:'-0.8px' }}>
            Financial Crime<br/>Surveillance Platform
          </h1>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:14, lineHeight:1.7, maxWidth:360 }}>
            A unified workbench for SAM AML alert review, workflow management, and regulatory reporting — powered by configurable datasources.
          </p>

          <div style={{ display:'flex', gap:24, marginTop:48 }}>
            {[['Multi-view', 'Alert triage'], ['RBAC', 'Role-based access'], ['Workflow', 'Configurable rules']].map(([title, sub]) => (
              <div key={title}>
                <div style={{ color:'#fff', fontSize:14, fontWeight:700 }}>{title}</div>
                <div style={{ color:'rgba(255,255,255,0.55)', fontSize:12 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 48px' }}>
        <div style={{ width:'100%', maxWidth:420 }}>
          <h2 style={{ fontSize:26, fontWeight:700, color:theme.color.text, marginBottom:6, letterSpacing:'-0.5px' }}>Welcome back</h2>
          <p style={{ fontSize:14, color:theme.color.textSecondary, marginBottom:32 }}>Sign in to access your workbench</p>

          <form onSubmit={handle} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <Input label="Username" value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              placeholder="Enter your username" required
              prefix={User} />

            <Input label="Password" value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              type={showPw ? 'text' : 'password'}
              placeholder="Enter your password" required
              prefix={Lock}
              suffix={
                <span onClick={() => setShowPw(!showPw)} style={{ cursor:'pointer' }}>
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </span>
              }
            />

            {error && (
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:theme.radius.md, padding:'10px 14px' }}>
                <AlertCircle size={15} color="#DC2626" />
                <span style={{ fontSize:13, color:'#DC2626' }}>{error}</span>
              </div>
            )}

            <Button type="submit" loading={loading} size="lg" style={{ marginTop:4, justifyContent:'center', width:'100%' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          {/* Demo credentials */}
          {datasourceMode === 'mock' && (
            <div style={{ marginTop:32, padding:20, background:'#fff', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, boxShadow:theme.shadow.sm }}>
              <div style={{ fontSize:11, fontWeight:700, color:theme.color.textMuted, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:12 }}>Demo Credentials (Mock Mode)</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {DEMO_USERS.map(u => (
                  <button key={u.username} onClick={() => quickLogin(u)}
                    style={{ background:'#F8FAFC', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.md, padding:'8px 10px', cursor:'pointer', textAlign:'left', transition:theme.transition.fast }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor=theme.color.primary; e.currentTarget.style.background=theme.color.primaryLight; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor=theme.color.border; e.currentTarget.style.background='#F8FAFC'; }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:u.color, display:'inline-block', flexShrink:0 }} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:theme.color.text }}>{u.username}</div>
                        <div style={{ fontSize:10, color:theme.color.textMuted, fontFamily:theme.font.mono }}>{u.role} · {u.password}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p style={{ textAlign:'center', fontSize:12, color:theme.color.textMuted, marginTop:24 }}>
            Authorized personnel only · All sessions are monitored
          </p>
        </div>
      </div>
    </div>
  );
}
