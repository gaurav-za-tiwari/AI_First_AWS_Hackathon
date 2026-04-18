import React from 'react';
import { Bell, Search, HelpCircle } from 'lucide-react';
import { theme } from '../../theme';
import { useAuth } from '../../context/AuthContext';

export default function TopHeader({ title, subtitle, actions, alertCount }) {
  const { user } = useAuth();

  return (
    <header style={{
      height: theme.layout.headerHeight,
      background: '#fff',
      borderBottom: `1px solid ${theme.color.border}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 16,
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
    }}>
      {/* Title area */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: theme.color.text, lineHeight: 1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: theme.color.textSecondary, marginTop: 1 }}>{subtitle}</div>}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {actions}

        {/* Alert count badge */}
        {alertCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: theme.color.primaryLight, border: `1px solid #BFDBFE`,
            borderRadius: 20, padding: '4px 12px',
          }}>
            <Bell size={13} color={theme.color.primary} />
            <span style={{ fontSize: 12, fontWeight: 600, color: theme.color.primary, fontFamily: theme.font.mono }}>
              {alertCount}
            </span>
          </div>
        )}

        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.color.textMuted, display: 'flex', padding: 6, borderRadius: 6 }}
          onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          <HelpCircle size={18} />
        </button>
      </div>
    </header>
  );
}
