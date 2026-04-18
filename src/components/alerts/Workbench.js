import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Filter, Download, RefreshCw, SlidersHorizontal, X, ChevronUp, ChevronDown, BarChart2 } from 'lucide-react';
import { StatusBadge, PriorityBadge, ScoreBadge } from '../common/Badges';
import { Button, Select, Spinner, Card } from '../common/UI';
import AlertDetail from './AlertDetail';
import TopHeader from '../layout/TopHeader';
import { theme } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import * as ds from '../../datasource';

const PAGE_SIZE = 20;

const STATUS_OPTIONS  = ['All Statuses', 'Open', 'In Review', 'Escalated', 'Closed', 'Rejected'];
const PRIORITY_OPTIONS= ['All Priorities', 'Critical', 'High', 'Medium', 'Low'];

function SortBtn({ col, current, dir, onClick }) {
  const active = current === col;
  return (
    <span onClick={() => onClick(col)} style={{ display:'inline-flex', alignItems:'center', gap:2, cursor:'pointer', userSelect:'none' }}>
      {active
        ? dir === 'ASC' ? <ChevronUp size={12} color={theme.color.primary}/> : <ChevronDown size={12} color={theme.color.primary}/>
        : <ChevronDown size={12} color={theme.color.textMuted}/>}
    </span>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div style={{ background:bg||'#fff', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, padding:'14px 18px', minWidth:110, animation:'slideIn 0.2s ease' }}>
      <div style={{ fontSize:22, fontWeight:800, color:color||theme.color.text, fontFamily:theme.font.mono }}>{value}</div>
      <div style={{ fontSize:11, color:theme.color.textMuted, fontWeight:600, marginTop:2 }}>{label}</div>
    </div>
  );
}

export default function Workbench() {
  const { user, permissions } = useAuth();

  const [views, setViews]           = useState([]);
  const [selectedView, setSelectedView] = useState('');
  const [alerts, setAlerts]         = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(false);
  const [loadingViews, setLoadingViews] = useState(true);

  const [search, setSearch]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter]     = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortKey, setSortKey]       = useState('Score');
  const [sortDir, setSortDir]       = useState('DESC');
  const [showFilters, setShowFilters] = useState(false);

  const [selectedAlert, setSelectedAlert] = useState(null);
  const [stats, setStats]           = useState({});

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Load views once on mount
  useEffect(() => {
    setLoadingViews(true);
    ds.getViews(user)
      .then(v => { setViews(v); if (v.length) setSelectedView(String(v[0].view_id)); })
      .catch(() => {})
      .finally(() => setLoadingViews(false));
  }, [user]);

  // Fetch alerts whenever filters change
  const fetchAlerts = useCallback(async () => {
    if (!selectedView) return;
    setLoading(true);
    try {
      const res = await ds.getAlerts({
        view_id:  selectedView,
        status:   statusFilter  || undefined,
        priority: priorityFilter|| undefined,
        search:   debouncedSearch || undefined,
        page, limit: PAGE_SIZE,
        sort: sortKey, dir: sortDir,
        user,
      });
      setAlerts(res.alerts);
      setTotal(res.total);

      // Compute stats from full view (no status filter for counts)
      const statsRes = await ds.getAlerts({ view_id: selectedView, page:1, limit:9999, user });
      const counts = {};
      statsRes.alerts.forEach(a => { counts[a.Status] = (counts[a.Status]||0)+1; });
      setStats(counts);
    } catch (e) {
      console.error('Fetch alerts error:', e);
    }
    setLoading(false);
  }, [selectedView, statusFilter, priorityFilter, debouncedSearch, page, sortKey, sortDir, user]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [selectedView, statusFilter, priorityFilter, debouncedSearch, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
    else { setSortKey(key); setSortDir('DESC'); }
  };

  const handleStatusChange = (alertId, newStatus) => {
    setAlerts(prev => prev.map(a => a.Alert_ID === alertId ? { ...a, Status: newStatus } : a));
    if (selectedAlert?.Alert_ID === alertId) {
      setSelectedAlert(prev => ({ ...prev, Status: newStatus }));
    }
    fetchAlerts();
  };

  const exportCSV = () => {
    if (!alerts.length) return;
    const headers = Object.keys(alerts[0]);
    const rows = [headers.join(','), ...alerts.map(r => headers.map(h => `"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))];
    const blob = new Blob([rows.join('\n')], { type:'text/csv' });
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`alerts_view${selectedView}_${Date.now()}.csv`; a.click();
  };

  const currentView = views.find(v => String(v.view_id) === String(selectedView));
  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const hasFilters  = !!(statusFilter || priorityFilter || debouncedSearch);

  const TH = ({ children, col, style={} }) => (
    <th style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:theme.color.textMuted, letterSpacing:'0.6px', textTransform:'uppercase', whiteSpace:'nowrap', background:'#F8FAFC', borderBottom:`1px solid ${theme.color.border}`, position:'sticky', top:0, ...style }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
        {children}
        {col && <SortBtn col={col} current={sortKey} dir={sortDir} onClick={handleSort}/>}
      </span>
    </th>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <TopHeader
        title="Alert Workbench"
        subtitle={currentView ? `Viewing: ${currentView.view_name}` : 'Select an alert view'}
        alertCount={total}
        actions={
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* View selector */}
            {loadingViews ? <Spinner size={18}/> : (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:12, fontWeight:600, color:theme.color.textSecondary, whiteSpace:'nowrap' }}>Alert View</span>
                <select value={selectedView} onChange={e => setSelectedView(e.target.value)}
                  style={{ background:'#fff', border:`1.5px solid ${theme.color.primary}`, borderRadius:theme.radius.md, padding:'6px 28px 6px 10px', fontSize:13, fontWeight:600, color:theme.color.primary, cursor:'pointer', outline:'none', appearance:'none',
                    backgroundImage:`url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 7L11 1' stroke='%231565C0' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center', paddingRight:28 }}>
                  {views.map(v => <option key={v.view_id} value={String(v.view_id)}>{v.view_name}</option>)}
                </select>
              </div>
            )}
            <Button variant="ghost" size="sm" icon={Download} onClick={exportCSV}>Export</Button>
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={fetchAlerts}>Refresh</Button>
          </div>
        }
      />

      <div style={{ flex:1, overflow:'auto', padding:theme.layout.contentPadding }}>

        {/* Stats row */}
        <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
          <StatCard label="Total"     value={total}                   color={theme.color.primary}        bg={theme.color.primaryLight}/>
          <StatCard label="Open"      value={stats['Open']||0}        color='#2563EB' bg='#EFF6FF'/>
          <StatCard label="In Review" value={stats['In Review']||0}   color='#D97706' bg='#FFFBEB'/>
          <StatCard label="Escalated" value={stats['Escalated']||0}   color='#DC2626' bg='#FEF2F2'/>
          <StatCard label="Closed"    value={stats['Closed']||0}      color='#16A34A' bg='#F0FDF4'/>
        </div>

        {/* Filter bar */}
        <div style={{ background:'#fff', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', boxShadow:theme.shadow.xs }}>
          {/* Search */}
          <div style={{ position:'relative', flex:1, minWidth:220, maxWidth:380 }}>
            <Search size={14} color={theme.color.textMuted} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }}/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search alerts, customers, descriptions…"
              style={{ width:'100%', boxSizing:'border-box', background:'#F8FAFC', border:`1.5px solid ${theme.color.border}`, borderRadius:theme.radius.md, padding:'8px 32px 8px 32px', fontSize:13, color:theme.color.text, outline:'none', fontFamily:theme.font.sans, transition:theme.transition.fast }}
              onFocus={e=>e.target.style.borderColor=theme.color.primary}
              onBlur={e=>e.target.style.borderColor=theme.color.border}/>
            {search && <button onClick={()=>setSearch('')} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:theme.color.textMuted, display:'flex' }}><X size={13}/></button>}
          </div>

          {/* Status filter */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value === 'All Statuses' ? '' : e.target.value)}
            style={{ background:'#fff', border:`1.5px solid ${statusFilter?theme.color.primary:theme.color.border}`, borderRadius:theme.radius.md, padding:'7px 28px 7px 10px', fontSize:13, color:statusFilter?theme.color.primary:theme.color.text, cursor:'pointer', outline:'none', appearance:'none', fontWeight:statusFilter?600:400,
              backgroundImage:`url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 7L11 1' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center', paddingRight:28 }}>
            {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
          </select>

          {/* Priority filter */}
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value === 'All Priorities' ? '' : e.target.value)}
            style={{ background:'#fff', border:`1.5px solid ${priorityFilter?theme.color.primary:theme.color.border}`, borderRadius:theme.radius.md, padding:'7px 28px 7px 10px', fontSize:13, color:priorityFilter?theme.color.primary:theme.color.text, cursor:'pointer', outline:'none', appearance:'none', fontWeight:priorityFilter?600:400,
              backgroundImage:`url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 7L11 1' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
              backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center', paddingRight:28 }}>
            {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
          </select>

          {hasFilters && (
            <button onClick={() => { setSearch(''); setStatusFilter(''); setPriorityFilter(''); }}
              style={{ background:'none', border:'none', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
              <X size={13}/> Clear filters
            </button>
          )}

          <span style={{ marginLeft:'auto', fontSize:12, color:theme.color.textMuted }}>
            {loading ? 'Loading…' : `${total} alert${total !== 1 ? 's' : ''}`}
            {!permissions.canViewAll && <span style={{ color:theme.color.textMuted }}> (assigned to you)</span>}
          </span>
        </div>

        {/* Table */}
        <div style={{ background:'#fff', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, boxShadow:theme.shadow.sm, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
              <thead>
                <tr>
                  <TH col="Alert_ID">Alert ID</TH>
                  <TH col="Customer_Name">Customer</TH>
                  <TH col="Alert_Type">Type</TH>
                  <TH col="Score" style={{ textAlign:'center' }}>Score</TH>
                  <TH col="Status">Status</TH>
                  <TH col="Priority">Priority</TH>
                  <TH col="Amount" style={{ textAlign:'right' }}>Amount</TH>
                  <TH col="Country">Country</TH>
                  <TH col="Assigned_To">Assigned To</TH>
                  <TH col="Created_Date">Created</TH>
                </tr>
              </thead>
              <tbody>
                {loading && alerts.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign:'center', padding:'60px 0' }}><Spinner size={28}/></td></tr>
                ) : alerts.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign:'center', padding:'60px 0', color:theme.color.textMuted, fontSize:14 }}>
                    <BarChart2 size={32} color={theme.color.border} style={{ display:'block', margin:'0 auto 12px' }}/>
                    No alerts match your current filters
                  </td></tr>
                ) : alerts.map((alert, i) => (
                  <tr key={alert.Alert_ID || i}
                    onClick={() => setSelectedAlert(alert)}
                    style={{ borderBottom:`1px solid ${theme.color.border}`, cursor:'pointer', transition:'background 0.1s', animation: `slideIn ${0.05+i*0.02}s ease` }}
                    onMouseEnter={e => e.currentTarget.style.background=theme.color.surfaceAlt}
                    onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                    <td style={{ padding:'12px 14px' }}>
                      <span style={{ fontSize:12, fontWeight:700, color:theme.color.primary, fontFamily:theme.font.mono }}>{alert.Alert_ID}</span>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ fontSize:13, fontWeight:500, color:theme.color.text }}>{alert.Customer_Name}</div>
                      <div style={{ fontSize:11, color:theme.color.textMuted, fontFamily:theme.font.mono }}>{alert.Customer_ID}</div>
                    </td>
                    <td style={{ padding:'12px 14px', maxWidth:180 }}>
                      <div style={{ fontSize:12, color:theme.color.textSecondary, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{alert.Alert_Type}</div>
                    </td>
                    <td style={{ padding:'12px 14px', textAlign:'center' }}>
                      <ScoreBadge score={alert.Score}/>
                    </td>
                    <td style={{ padding:'12px 14px' }}><StatusBadge status={alert.Status}/></td>
                    <td style={{ padding:'12px 14px' }}><PriorityBadge priority={alert.Priority}/></td>
                    <td style={{ padding:'12px 14px', textAlign:'right', fontSize:12, fontFamily:theme.font.mono, color:theme.color.textSecondary, whiteSpace:'nowrap' }}>
                      {alert.Amount ? `${Number(alert.Amount).toLocaleString()} ${alert.Currency}` : '—'}
                    </td>
                    <td style={{ padding:'12px 14px', fontSize:12, fontFamily:theme.font.mono, color:theme.color.textMuted }}>{alert.Country}</td>
                    <td style={{ padding:'12px 14px', fontSize:12, fontFamily:theme.font.mono, color:theme.color.textSecondary }}>{alert.Assigned_To}</td>
                    <td style={{ padding:'12px 14px', fontSize:11, fontFamily:theme.font.mono, color:theme.color.textMuted, whiteSpace:'nowrap' }}>
                      {alert.Created_Date ? String(alert.Created_Date).split('T')[0] : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderTop:`1px solid ${theme.color.border}`, background:'#F8FAFC' }}>
              <span style={{ fontSize:12, color:theme.color.textMuted }}>
                Page {page} of {totalPages} &nbsp;·&nbsp; {total} total
              </span>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                  style={{ background:'#fff', border:`1px solid ${theme.color.border}`, borderRadius:6, padding:'5px 12px', cursor:page===1?'not-allowed':'pointer', color:page===1?theme.color.textMuted:theme.color.text, fontSize:12, opacity:page===1?0.5:1 }}>‹ Prev</button>
                {Array.from({length:Math.min(totalPages,7)},(_,i)=>{
                  let p; if(totalPages<=7) p=i+1; else if(page<=4) p=i+1; else if(page>=totalPages-3) p=totalPages-6+i; else p=page-3+i;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      style={{ background:p===page?theme.color.primary:'#fff', border:`1px solid ${p===page?theme.color.primary:theme.color.border}`, borderRadius:6, padding:'5px 10px', cursor:'pointer', color:p===page?'#fff':theme.color.text, fontSize:12, fontWeight:p===page?700:400, minWidth:32 }}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                  style={{ background:'#fff', border:`1px solid ${theme.color.border}`, borderRadius:6, padding:'5px 12px', cursor:page===totalPages?'not-allowed':'pointer', color:page===totalPages?theme.color.textMuted:theme.color.text, fontSize:12, opacity:page===totalPages?0.5:1 }}>Next ›</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedAlert && (
        <AlertDetail
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
