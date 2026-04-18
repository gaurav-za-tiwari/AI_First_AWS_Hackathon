/**
 * theme.js — Enterprise Light Material Design Token System
 * Crisp, professional, banking-grade aesthetic
 */

export const theme = {
  // ── Color palette ──────────────────────────────────────────────────────────
  color: {
    primary:        '#1565C0',  // Deep blue — primary actions
    primaryLight:   '#E3F2FD',  // Pale blue — hover states, backgrounds
    primaryMid:     '#1976D2',  // Mid blue — hover
    primaryDark:    '#0D47A1',  // Darkest blue
    accent:         '#0288D1',  // Cyan-blue accent
    surface:        '#FFFFFF',  // Card/panel surfaces
    surfaceAlt:     '#F8FAFC',  // Slightly off-white for alternating rows
    background:     '#F0F4F8',  // App background
    sidebarBg:      '#FFFFFF',  // Sidebar white
    border:         '#E2E8F0',  // Subtle borders
    borderMid:      '#CBD5E1',  // Slightly stronger border
    text:           '#0F172A',  // Primary text
    textSecondary:  '#475569',  // Secondary text
    textMuted:      '#94A3B8',  // Muted/placeholder
    textOnPrimary:  '#FFFFFF',  // Text on primary colored elements
    // Status
    statusOpen:     '#2563EB',
    statusReview:   '#D97706',
    statusEscalated:'#DC2626',
    statusClosed:   '#16A34A',
    statusRejected: '#6B7280',
    // Priority
    critical:       '#DC2626',
    high:           '#EA580C',
    medium:         '#CA8A04',
    low:            '#16A34A',
    // Semantic
    success:        '#16A34A',
    warning:        '#D97706',
    error:          '#DC2626',
    info:           '#0288D1',
  },

  // ── Shadows ────────────────────────────────────────────────────────────────
  shadow: {
    xs:  '0 1px 2px rgba(15,23,42,0.05)',
    sm:  '0 1px 4px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)',
    md:  '0 4px 12px rgba(15,23,42,0.1), 0 2px 4px rgba(15,23,42,0.06)',
    lg:  '0 8px 24px rgba(15,23,42,0.12), 0 4px 8px rgba(15,23,42,0.06)',
    xl:  '0 20px 48px rgba(15,23,42,0.14), 0 8px 16px rgba(15,23,42,0.08)',
    modal:'0 32px 80px rgba(15,23,42,0.2), 0 8px 24px rgba(15,23,42,0.1)',
  },

  // ── Typography ─────────────────────────────────────────────────────────────
  font: {
    sans:  "'DM Sans', 'Segoe UI', sans-serif",
    mono:  "'JetBrains Mono', 'Fira Code', monospace",
    sizes: { xs:11, sm:12, md:13, base:14, lg:16, xl:18, '2xl':22, '3xl':28 },
  },

  // ── Spacing ────────────────────────────────────────────────────────────────
  space: { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40, 12:48 },

  // ── Border radius ──────────────────────────────────────────────────────────
  radius: { sm:4, md:8, lg:12, xl:16, full:9999 },

  // ── Transitions ────────────────────────────────────────────────────────────
  transition: {
    fast: 'all 0.12s ease',
    base: 'all 0.18s ease',
    slow: 'all 0.28s ease',
  },

  // ── Layout ─────────────────────────────────────────────────────────────────
  layout: {
    sidebarWidth: 240,
    headerHeight: 60,
    contentPadding: 24,
  },
};

// Status config helper
export const STATUS_CONFIG = {
  'Open':      { color: theme.color.statusOpen,      bg: '#EFF6FF', label: 'Open'      },
  'In Review': { color: theme.color.statusReview,    bg: '#FFFBEB', label: 'In Review' },
  'Escalated': { color: theme.color.statusEscalated, bg: '#FEF2F2', label: 'Escalated' },
  'Closed':    { color: theme.color.statusClosed,    bg: '#F0FDF4', label: 'Closed'    },
  'Rejected':  { color: theme.color.statusRejected,  bg: '#F9FAFB', label: 'Rejected'  },
};

export const PRIORITY_CONFIG = {
  'Critical': { color: theme.color.critical, bg: '#FEF2F2' },
  'High':     { color: theme.color.high,     bg: '#FFF7ED' },
  'Medium':   { color: theme.color.medium,   bg: '#FEFCE8' },
  'Low':      { color: theme.color.low,      bg: '#F0FDF4' },
};
