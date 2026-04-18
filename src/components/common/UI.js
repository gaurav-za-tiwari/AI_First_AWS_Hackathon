import React from 'react';
import { Loader2 } from 'lucide-react';
import { theme } from '../../theme';

// ── Button ────────────────────────────────────────────────────────────────────
export function Button({ children, variant='primary', size='md', loading=false, disabled=false, icon:Icon, onClick, style={}, type='button' }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: 'none', cursor: disabled||loading ? 'not-allowed' : 'pointer',
    fontFamily: theme.font.sans, fontWeight: 600, letterSpacing: '0.2px',
    transition: theme.transition.base, opacity: disabled||loading ? 0.65 : 1,
    borderRadius: theme.radius.md,
    ...{
      sm: { padding: '6px 12px', fontSize: 12 },
      md: { padding: '9px 18px', fontSize: 13 },
      lg: { padding: '12px 24px', fontSize: 14 },
    }[size],
    ...{
      primary: { background: theme.color.primary, color: '#fff', boxShadow: '0 1px 3px rgba(21,101,192,0.3)' },
      secondary: { background: '#fff', color: theme.color.primary, border: `1.5px solid ${theme.color.primary}`, boxShadow: theme.shadow.xs },
      ghost: { background: 'transparent', color: theme.color.textSecondary },
      danger: { background: '#DC2626', color: '#fff', boxShadow: '0 1px 3px rgba(220,38,38,0.3)' },
      success: { background: '#16A34A', color: '#fff' },
    }[variant],
    ...style,
  };
  return (
    <button type={type} style={base} disabled={disabled||loading} onClick={onClick}
      onMouseEnter={e => { if(!disabled&&!loading) e.currentTarget.style.filter='brightness(0.93)'; }}
      onMouseLeave={e => { e.currentTarget.style.filter=''; }}>
      {loading ? <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> : Icon ? <Icon size={14}/> : null}
      {children}
    </button>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ label, error, prefix:Prefix, suffix:Suffix, style={}, containerStyle={}, ...props }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5, ...containerStyle }}>
      {label && <label style={{ fontSize:12, fontWeight:600, color:theme.color.textSecondary, letterSpacing:'0.3px' }}>{label}</label>}
      <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
        {Prefix && <div style={{ position:'absolute', left:10, color:theme.color.textMuted, display:'flex' }}><Prefix size={14}/></div>}
        <input style={{
          width:'100%', boxSizing:'border-box',
          background:'#fff', border:`1.5px solid ${error ? '#DC2626' : theme.color.border}`,
          borderRadius:theme.radius.md, padding:`9px ${Suffix?'36px':'12px'} 9px ${Prefix?'34px':'12px'}`,
          fontSize:13, color:theme.color.text, fontFamily:theme.font.sans, outline:'none',
          transition:theme.transition.fast,
          ...style,
        }}
          onFocus={e => e.target.style.borderColor=error?'#DC2626':theme.color.primary}
          onBlur={e  => e.target.style.borderColor=error?'#DC2626':theme.color.border}
          {...props}
        />
        {Suffix && <div style={{ position:'absolute', right:10, color:theme.color.textMuted, display:'flex', cursor:'pointer' }}>{Suffix}</div>}
      </div>
      {error && <span style={{ fontSize:11, color:'#DC2626' }}>{error}</span>}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({ label, error, options=[], style={}, containerStyle={}, ...props }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5, ...containerStyle }}>
      {label && <label style={{ fontSize:12, fontWeight:600, color:theme.color.textSecondary, letterSpacing:'0.3px' }}>{label}</label>}
      <select style={{
        width:'100%', background:'#fff', border:`1.5px solid ${error?'#DC2626':theme.color.border}`,
        borderRadius:theme.radius.md, padding:'9px 12px', fontSize:13, color:theme.color.text,
        fontFamily:theme.font.sans, outline:'none', cursor:'pointer',
        transition:theme.transition.fast, appearance:'none',
        backgroundImage:`url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 7L11 1' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat:'no-repeat', backgroundPosition:'right 12px center',
        paddingRight: 32, ...style,
      }}
        onFocus={e => e.target.style.borderColor=theme.color.primary}
        onBlur={e  => e.target.style.borderColor=error?'#DC2626':theme.color.border}
        {...props}>
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
      {error && <span style={{ fontSize:11, color:'#DC2626' }}>{error}</span>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, subtitle, children, width=560, footer }) {
  if (!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(3px)', animation:'fadeIn 0.15s ease' }}
      onClick={e => { if(e.target===e.currentTarget) onClose?.(); }}>
      <div style={{ width:'100%', maxWidth:width, maxHeight:'90vh', background:'#fff', borderRadius:theme.radius.xl, boxShadow:theme.shadow.modal, display:'flex', flexDirection:'column', animation:'slideUp 0.18s ease' }}>
        {/* Header */}
        {title && (
          <div style={{ padding:'20px 24px 16px', borderBottom:`1px solid ${theme.color.border}`, flexShrink:0 }}>
            <div style={{ fontSize:17, fontWeight:700, color:theme.color.text }}>{title}</div>
            {subtitle && <div style={{ fontSize:13, color:theme.color.textSecondary, marginTop:3 }}>{subtitle}</div>}
          </div>
        )}
        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:24 }}>{children}</div>
        {/* Footer */}
        {footer && <div style={{ padding:'16px 24px', borderTop:`1px solid ${theme.color.border}`, display:'flex', gap:10, justifyContent:'flex-end', flexShrink:0 }}>{footer}</div>}
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size=24, color }) {
  return (
    <Loader2 size={size} color={color||theme.color.primary}
      style={{ animation:'spin 0.8s linear infinite' }} />
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style={}, onClick, hoverable }) {
  return (
    <div style={{
      background:'#fff', borderRadius:theme.radius.lg,
      border:`1px solid ${theme.color.border}`, boxShadow:theme.shadow.sm,
      transition:hoverable ? theme.transition.base : undefined,
      cursor: onClick ? 'pointer' : undefined, ...style,
    }}
      onClick={onClick}
      onMouseEnter={e => { if(hoverable) { e.currentTarget.style.boxShadow=theme.shadow.md; e.currentTarget.style.transform='translateY(-1px)'; }}}
      onMouseLeave={e => { if(hoverable) { e.currentTarget.style.boxShadow=theme.shadow.sm; e.currentTarget.style.transform=''; }}}>
      {children}
    </div>
  );
}

// ── Tooltip (simple) ──────────────────────────────────────────────────────────
export function Tooltip({ children, text }) {
  return (
    <div style={{ position:'relative', display:'inline-flex' }}
      onMouseEnter={e => { const t=e.currentTarget.querySelector('.tip'); if(t) t.style.opacity=1; }}
      onMouseLeave={e => { const t=e.currentTarget.querySelector('.tip'); if(t) t.style.opacity=0; }}>
      {children}
      <div className="tip" style={{ position:'absolute', bottom:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)', background:'#1E293B', color:'#fff', fontSize:11, padding:'4px 8px', borderRadius:5, whiteSpace:'nowrap', pointerEvents:'none', opacity:0, transition:'opacity 0.12s', zIndex:999 }}>
        {text}
      </div>
    </div>
  );
}

// ── Global keyframes (injected once) ─────────────────────────────────────────
if (!document.getElementById('aml-keyframes')) {
  const style = document.createElement('style');
  style.id = 'aml-keyframes';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
    @keyframes slideUp { from { transform:translateY(16px);opacity:0; } to { transform:translateY(0);opacity:1; } }
    @keyframes slideIn { from { transform:translateX(-8px);opacity:0; } to { transform:translateX(0);opacity:1; } }
    @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.5} }
    * { box-sizing: border-box; }
    body { margin:0; font-family:'DM Sans',sans-serif; background:#F0F4F8; }
    ::-webkit-scrollbar { width:6px; height:6px; }
    ::-webkit-scrollbar-track { background:transparent; }
    ::-webkit-scrollbar-thumb { background:#CBD5E1; border-radius:3px; }
    ::-webkit-scrollbar-thumb:hover { background:#94A3B8; }
    input::placeholder, textarea::placeholder { color:#94A3B8; }
    a { text-decoration: none; }
  `;
  document.head.appendChild(style);
}
