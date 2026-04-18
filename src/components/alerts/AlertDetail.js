import React, { useState, useEffect, useCallback } from 'react';
import { X, ArrowRight, User, Calendar, DollarSign, MapPin, Tag, ChevronRight, Clock, AlertTriangle, FileText } from 'lucide-react';
import { StatusBadge, PriorityBadge, ScoreBadge } from '../common/Badges';
import { Button, Spinner } from '../common/UI';
import { theme } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import * as ds from '../../datasource';

const TABS = ['Details', 'Workflow', 'Audit'];

export default function AlertDetail({ alert, onClose, onStatusChange }) {
  const { user, permissions } = useAuth();
  const [activeTab, setActiveTab]   = useState('Details');
  const [workflow, setWorkflow]     = useState({});
  const [auditLog, setAuditLog]     = useState([]);
  const [comment, setComment]       = useState('');
  const [transitioning, setTransit] = useState(false);
  const [localAlert, setLocalAlert] = useState(alert);

  useEffect(() => {
    setLocalAlert(alert);
  }, [alert]);

  useEffect(() => {
    if (localAlert?.Alert_Type_ID) {
      ds.getWorkflow(localAlert.Alert_Type_ID).then(setWorkflow).catch(() => {});
    }
    if (localAlert?.Alert_ID) {
      ds.getAuditLog(localAlert.Alert_ID).then(setAuditLog).catch(() => {});
    }
  }, [localAlert?.Alert_ID, localAlert?.Alert_Type_ID]);

  const currentStatus = localAlert?.Status || 'Open';
  const allowedNext   = workflow[currentStatus] || [];

  const doTransition = async (targetStatus) => {
    if (!comment.trim()) { alert('Please add a comment before transitioning.'); return; }
    setTransit(true);
    try {
      await ds.updateAlertStatus(localAlert.Alert_ID, {
        status: targetStatus, comment, fromStatus: currentStatus,
        action: null, userId: user.id, userName: user.name,
      });
      const updated = { ...localAlert, Status: targetStatus };
      setLocalAlert(updated);
      onStatusChange?.(localAlert.Alert_ID, targetStatus);
      // Refresh audit log
      const log = await ds.getAuditLog(localAlert.Alert_ID);
      setAuditLog(log);
      setComment('');
    } catch (e) {
      alert(`Transition failed: ${e}`);
    }
    setTransit(false);
  };

  const Field = ({ icon: Icon, label, value, mono, wide }) => (
    <div style={{ gridColumn: wide ? 'span 2' : undefined }}>
      <div style={{ display:'flex', alignItems:'center', gap:4, color:theme.color.textMuted, fontSize:10, fontWeight:700, letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:4 }}>
        {Icon && <Icon size={11}/>}{label}
      </div>
      <div style={{ color:theme.color.text, fontSize:13, fontFamily:mono?theme.font.mono:undefined, wordBreak:'break-word' }}>
        {value ?? <span style={{color:theme.color.textMuted}}>—</span>}
      </div>
    </div>
  );

  if (!localAlert) return null;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.4)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(4px)', animation:'fadeIn 0.15s ease' }}
      onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:'100%', maxWidth:800, maxHeight:'92vh', background:'#fff', borderRadius:theme.radius.xl, boxShadow:theme.shadow.modal, display:'flex', flexDirection:'column', animation:'slideUp 0.18s ease', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'18px 24px', borderBottom:`1px solid ${theme.color.border}`, background: '#FAFBFD', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <span style={{ fontSize:16, fontWeight:700, color:theme.color.text, fontFamily:theme.font.mono }}>{localAlert.Alert_ID}</span>
                <StatusBadge status={currentStatus} />
                <PriorityBadge priority={localAlert.Priority} />
              </div>
              <div style={{ fontSize:12, color:theme.color.textSecondary, marginTop:4 }}>
                {localAlert.Alert_Type} &nbsp;·&nbsp; Score: <span style={{color:theme.color.primary, fontWeight:700, fontFamily:theme.font.mono}}>{localAlert.Score}</span>
                &nbsp;·&nbsp; {localAlert.view_name || localAlert.business_unit}
              </div>
            </div>
            <button onClick={onClose} style={{ background:'#F1F5F9', border:'none', borderRadius:8, padding:6, cursor:'pointer', color:theme.color.textSecondary, display:'flex', flexShrink:0 }}
              onMouseEnter={e=>e.currentTarget.style.background='#E2E8F0'}
              onMouseLeave={e=>e.currentTarget.style.background='#F1F5F9'}>
              <X size={17}/>
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:0, marginTop:14 }}>
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ padding:'8px 16px', background:'none', border:'none', borderBottom:`2.5px solid ${activeTab===tab?theme.color.primary:'transparent'}`, color: activeTab===tab?theme.color.primary:theme.color.textSecondary, fontSize:13, fontWeight: activeTab===tab?600:500, cursor:'pointer', transition:theme.transition.fast }}>
                {tab}
                {tab==='Audit' && auditLog.length>0 && <span style={{ marginLeft:5, background:theme.color.primaryLight, color:theme.color.primary, borderRadius:20, padding:'1px 6px', fontSize:10, fontWeight:700 }}>{auditLog.length}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:24 }}>

          {/* ── DETAILS ── */}
          {activeTab === 'Details' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Customer */}
              <section style={{ background:'#F8FAFC', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, padding:18 }}>
                <div style={{ fontSize:11, fontWeight:700, color:theme.color.textMuted, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:14 }}>Customer Information</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
                  <Field icon={User}    label="Customer Name" value={localAlert.Customer_Name} />
                  <Field icon={User}    label="Customer ID"   value={localAlert.Customer_ID} mono />
                  <Field icon={MapPin}  label="Country"       value={localAlert.Country} mono />
                </div>
              </section>

              {/* Transaction */}
              <section style={{ background:'#F8FAFC', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, padding:18 }}>
                <div style={{ fontSize:11, fontWeight:700, color:theme.color.textMuted, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:14 }}>Transaction Details</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
                  <Field icon={DollarSign} label="Amount" value={localAlert.Amount ? `${Number(localAlert.Amount).toLocaleString()} ${localAlert.Currency}` : '—'} mono />
                  <Field icon={Calendar}   label="Created Date" value={localAlert.Created_Date ? String(localAlert.Created_Date).split('T')[0] : '—'} mono />
                  <Field icon={User}       label="Assigned To" value={localAlert.Assigned_To} mono />
                </div>
              </section>

              {/* Description */}
              <section style={{ background:`${theme.color.primaryLight}60`, border:`1px solid #BFDBFE`, borderRadius:theme.radius.lg, padding:18 }}>
                <div style={{ fontSize:11, fontWeight:700, color:theme.color.primaryMid, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:10 }}>Alert Description</div>
                <div style={{ fontSize:13, color:theme.color.text, lineHeight:1.75 }}>{localAlert.Description || 'No description provided.'}</div>
              </section>

              {/* Risk flags */}
              {localAlert.Risk_Flags && localAlert.Risk_Flags.length > 0 && (
                <section>
                  <div style={{ fontSize:11, fontWeight:700, color:theme.color.textMuted, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:10 }}>Risk Flags</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {(Array.isArray(localAlert.Risk_Flags) ? localAlert.Risk_Flags : JSON.parse(localAlert.Risk_Flags || '[]')).map(flag => (
                      <span key={flag} style={{ background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                        <AlertTriangle size={11}/>{flag}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Closure comment */}
              {localAlert.Closure_Comment && (
                <section style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:theme.radius.lg, padding:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#15803D', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8 }}>Closure Comment</div>
                  <div style={{ fontSize:13, color:theme.color.text }}>{localAlert.Closure_Comment}</div>
                </section>
              )}

              {/* All fields */}
              <details style={{ cursor:'pointer' }}>
                <summary style={{ fontSize:12, fontWeight:600, color:theme.color.textMuted, listStyle:'none', display:'flex', alignItems:'center', gap:6, padding:'8px 0', userSelect:'none' }}>
                  <FileText size={13}/> View all raw fields
                </summary>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginTop:10, background:'#F8FAFC', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.md, padding:14 }}>
                  {Object.entries(localAlert).map(([k,v]) => (
                    <div key={k} style={{ display:'flex', gap:8, borderBottom:`1px solid ${theme.color.border}`, paddingBottom:4 }}>
                      <span style={{ color:theme.color.textMuted, fontSize:11, minWidth:130, flexShrink:0 }}>{k}</span>
                      <span style={{ color:theme.color.textSecondary, fontSize:11, fontFamily:theme.font.mono, wordBreak:'break-all' }}>{String(v ?? '—')}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* ── WORKFLOW ── */}
          {activeTab === 'Workflow' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Current state */}
              <div style={{ background:'#F8FAFC', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, padding:18 }}>
                <div style={{ fontSize:11, fontWeight:700, color:theme.color.textMuted, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:12 }}>Current Workflow State</div>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <StatusBadge status={currentStatus} />
                  {allowedNext.length > 0 && <ArrowRight size={15} color={theme.color.textMuted}/>}
                  {allowedNext.map(s => <StatusBadge key={s} status={s}/>)}
                  {allowedNext.length === 0 && (
                    <span style={{ fontSize:13, color:theme.color.textMuted }}>This alert is in a terminal state — no further transitions allowed.</span>
                  )}
                </div>
              </div>

              {/* Transition form */}
              {permissions.canTransition && allowedNext.length > 0 ? (
                <div style={{ background:'#fff', border:`1.5px solid ${theme.color.border}`, borderRadius:theme.radius.lg, padding:20 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.color.text, marginBottom:14 }}>Perform Transition</div>

                  <div style={{ marginBottom:16 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:600, color:theme.color.textSecondary, marginBottom:6 }}>
                      Analyst Comment <span style={{ color:'#DC2626' }}>*</span>
                    </label>
                    <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
                      placeholder="Describe your findings and the reason for this transition…"
                      style={{ width:'100%', boxSizing:'border-box', background:'#fff', border:`1.5px solid ${theme.color.border}`, borderRadius:theme.radius.md, padding:'10px 12px', fontSize:13, color:theme.color.text, fontFamily:theme.font.sans, resize:'vertical', outline:'none', transition:theme.transition.fast }}
                      onFocus={e => e.target.style.borderColor=theme.color.primary}
                      onBlur={e  => e.target.style.borderColor=theme.color.border}
                    />
                  </div>

                  <div style={{ fontSize:12, fontWeight:600, color:theme.color.textMuted, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.5px' }}>Transition To</div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    {allowedNext.map(target => (
                      <Button key={target} variant="secondary" size="sm" loading={transitioning} icon={ChevronRight}
                        onClick={() => doTransition(target)}>
                        {target}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : !permissions.canTransition ? (
                <div style={{ background:'#F9FAFB', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, padding:16, color:theme.color.textMuted, fontSize:13 }}>
                  Your role (<strong>{user.role}</strong>) does not have permission to perform workflow transitions.
                </div>
              ) : null}
            </div>
          )}

          {/* ── AUDIT ── */}
          {activeTab === 'Audit' && (
            <div>
              {auditLog.length === 0 ? (
                <div style={{ textAlign:'center', padding:'48px 0', color:theme.color.textMuted, fontSize:13 }}>
                  <Clock size={32} color={theme.color.border} style={{ display:'block', margin:'0 auto 12px' }}/>
                  No workflow transitions recorded yet.
                </div>
              ) : auditLog.map((entry, i) => (
                <div key={i} style={{ background:'#fff', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, padding:16, marginBottom:10, animation:'slideIn 0.15s ease', boxShadow:theme.shadow.xs }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
                    <StatusBadge status={entry.from_status} size="sm"/>
                    <ArrowRight size={13} color={theme.color.textMuted}/>
                    <StatusBadge status={entry.to_status} size="sm"/>
                    <span style={{ marginLeft:'auto', fontSize:11, color:theme.color.textMuted, fontFamily:theme.font.mono }}>
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize:12, color:theme.color.textSecondary }}>
                    By <strong style={{ color:theme.color.text }}>{entry.user_name || entry.user_id}</strong>
                    {entry.comment && <span> · {entry.comment}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
