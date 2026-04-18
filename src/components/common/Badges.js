import React from 'react';
import { STATUS_CONFIG, PRIORITY_CONFIG } from '../../theme';

export function StatusBadge({ status, size = 'md' }) {
  const cfg = STATUS_CONFIG[status] || { color: '#6B7280', bg: '#F9FAFB', label: status };
  const pad = size === 'sm' ? '2px 8px' : '3px 10px';
  const fs  = size === 'sm' ? 11 : 12;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}40`,
      borderRadius: 20, padding: pad, fontSize: fs, fontWeight: 600,
      whiteSpace: 'nowrap', letterSpacing: '0.2px',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block', flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

export function PriorityBadge({ priority, size = 'md' }) {
  const cfg = PRIORITY_CONFIG[priority] || { color: '#6B7280', bg: '#F9FAFB' };
  const pad = size === 'sm' ? '2px 8px' : '3px 10px';
  const fs  = size === 'sm' ? 11 : 12;
  return (
    <span style={{
      display: 'inline-block',
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}30`,
      borderRadius: 20, padding: pad, fontSize: fs, fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {priority}
    </span>
  );
}

export function RoleBadge({ role }) {
  const configs = {
    admin:      { bg: '#FEF3C7', color: '#92400E', label: 'Admin' },
    supervisor: { bg: '#EDE9FE', color: '#5B21B6', label: 'Supervisor' },
    analyst:    { bg: '#DBEAFE', color: '#1E40AF', label: 'Analyst' },
    readonly:   { bg: '#F3F4F6', color: '#374151', label: 'Read Only' },
  };
  const cfg = configs[role] || { bg: '#F3F4F6', color: '#374151', label: role };
  return (
    <span style={{
      display: 'inline-block', background: cfg.bg, color: cfg.color,
      borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
    }}>
      {cfg.label}
    </span>
  );
}

export function ScoreBadge({ score }) {
  const color = score >= 90 ? '#DC2626' : score >= 75 ? '#EA580C' : score >= 60 ? '#CA8A04' : '#16A34A';
  return (
    <span style={{
      display: 'inline-block', minWidth: 36, textAlign: 'center',
      background: `${color}12`, color, border: `1px solid ${color}30`,
      borderRadius: 6, padding: '2px 6px', fontSize: 12, fontWeight: 700,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {score}
    </span>
  );
}
