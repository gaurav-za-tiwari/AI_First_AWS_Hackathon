import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Search, X, Shield, CheckCircle, XCircle, Users } from 'lucide-react';
import { RoleBadge } from '../common/Badges';
import { Button, Input, Select, Modal, Spinner, Card } from '../common/UI';
import TopHeader from '../layout/TopHeader';
import { theme } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import * as ds from '../../datasource';

const ROLE_OPTIONS    = ['analyst', 'supervisor', 'admin', 'readonly'];
const EMPTY_FORM = { name:'', username:'', email:'', password:'', role:'analyst', group:'', business_unit:'', view_id:'', active:1, allowedViews:[] };

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers]       = useState([]);
  const [views, setViews]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');

  const [modalOpen, setModalOpen]   = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [u, v] = await Promise.all([ds.getUsers(), ds.getAllViews()]);
      setUsers(u); setViews(v);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setForm({ name:u.name, username:u.username, email:u.email, password:'', role:u.role, group:u.group||'', business_unit:u.business_unit||'', view_id:u.view_id||'', active:u.active, allowedViews:u.allowedViews||[] });
    setFormErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim())     e.name     = 'Name is required';
    if (!form.username.trim()) e.username = 'Username is required';
    if (!form.email.trim())    e.email    = 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    if (!editingUser && !form.password) e.password = 'Password is required';
    if (form.password && form.password.length < 6) e.password = 'Minimum 6 characters';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { ...form, view_id: form.view_id || null, allowedViews: form.allowedViews };
      if (editingUser) await ds.updateUser(editingUser.id, payload);
      else             await ds.createUser(payload);
      setModalOpen(false);
      await loadData();
    } catch (e) {
      setFormErrors({ general: String(e.message || e) });
    }
    setSaving(false);
  };

  const handleToggle = async (id) => {
    try { await ds.toggleUserActive(id); await loadData(); } catch (e) { alert(String(e)); }
  };

  const handleDelete = async (id) => {
    try { await ds.deleteUser(id, currentUser.id); setDeleteConfirm(null); await loadData(); } catch (e) { alert(String(e)); }
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleViewAccess = (vid) => {
    setForm(f => ({
      ...f,
      allowedViews: f.allowedViews.includes(vid)
        ? f.allowedViews.filter(v => v !== vid)
        : [...f.allowedViews, vid],
    }));
  };

  const filtered = users.filter(u =>
    !search || ['name','username','email','role','group','business_unit'].some(k => String(u[k]||'').toLowerCase().includes(search.toLowerCase()))
  );

  const stats = {
    total:  users.length,
    active: users.filter(u => u.active).length,
    admin:  users.filter(u => u.role==='admin').length,
    analyst:users.filter(u => u.role==='analyst').length,
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <TopHeader
        title="User Management"
        subtitle={`${stats.total} users · ${stats.active} active`}
        actions={<Button icon={Plus} onClick={openAdd}>Add User</Button>}
      />

      <div style={{ flex:1, overflow:'auto', padding:theme.layout.contentPadding }}>

        {/* Stats */}
        <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
          {[
            { label:'Total Users',   value:stats.total,   color:theme.color.primary,  bg:theme.color.primaryLight },
            { label:'Active',        value:stats.active,  color:'#16A34A', bg:'#F0FDF4' },
            { label:'Admin / Sup',   value:stats.admin,   color:'#92400E', bg:'#FEF3C7' },
            { label:'Analysts',      value:stats.analyst, color:'#1E40AF', bg:'#DBEAFE' },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.color}30`, borderRadius:theme.radius.lg, padding:'14px 20px', minWidth:120 }}>
              <div style={{ fontSize:24, fontWeight:800, color:s.color, fontFamily:theme.font.mono }}>{s.value}</div>
              <div style={{ fontSize:11, color:s.color, fontWeight:600, marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search bar */}
        <div style={{ background:'#fff', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12, boxShadow:theme.shadow.xs }}>
          <div style={{ position:'relative', flex:1, maxWidth:360 }}>
            <Search size={14} color={theme.color.textMuted} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }}/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
              style={{ width:'100%', boxSizing:'border-box', background:'#F8FAFC', border:`1.5px solid ${theme.color.border}`, borderRadius:theme.radius.md, padding:'8px 12px 8px 32px', fontSize:13, outline:'none', fontFamily:theme.font.sans }}
              onFocus={e=>e.target.style.borderColor=theme.color.primary}
              onBlur={e=>e.target.style.borderColor=theme.color.border}/>
            {search && <button onClick={()=>setSearch('')} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:theme.color.textMuted, display:'flex' }}><X size={13}/></button>}
          </div>
          <span style={{ marginLeft:'auto', fontSize:12, color:theme.color.textMuted }}>{filtered.length} result{filtered.length!==1?'s':''}</span>
        </div>

        {/* Table */}
        <div style={{ background:'#fff', border:`1px solid ${theme.color.border}`, borderRadius:theme.radius.lg, boxShadow:theme.shadow.sm, overflow:'hidden' }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:'60px 0' }}><Spinner size={28}/></div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:800 }}>
                <thead>
                  <tr style={{ background:'#F8FAFC', borderBottom:`1px solid ${theme.color.border}` }}>
                    {['User','Username','Email','Role','Group','Business Unit','Views','Status','Actions'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:theme.color.textMuted, letterSpacing:'0.6px', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign:'center', padding:'48px 0', color:theme.color.textMuted, fontSize:14 }}>
                      <Users size={32} color={theme.color.border} style={{ display:'block', margin:'0 auto 12px' }}/>
                      No users found
                    </td></tr>
                  ) : filtered.map((u, i) => (
                    <tr key={u.id} style={{ borderBottom:`1px solid ${theme.color.border}`, transition:'background 0.1s', animation:`slideIn ${0.05+i*0.02}s ease` }}
                      onMouseEnter={e => e.currentTarget.style.background=theme.color.surfaceAlt}
                      onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:'50%', background:`linear-gradient(135deg,${theme.color.primary},${theme.color.accent})`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ color:'#fff', fontSize:13, fontWeight:700 }}>{u.name?.charAt(0)}</span>
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:theme.color.text }}>{u.name}</div>
                            {u.last_login && <div style={{ fontSize:10, color:theme.color.textMuted, fontFamily:theme.font.mono }}>Last: {new Date(u.last_login).toLocaleDateString()}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:12, fontFamily:theme.font.mono, color:theme.color.textSecondary }}>{u.username}</td>
                      <td style={{ padding:'12px 14px', fontSize:12, color:theme.color.textSecondary }}>{u.email}</td>
                      <td style={{ padding:'12px 14px' }}><RoleBadge role={u.role}/></td>
                      <td style={{ padding:'12px 14px', fontSize:12, color:theme.color.textMuted }}>{u.group || '—'}</td>
                      <td style={{ padding:'12px 14px', fontSize:12, color:theme.color.textMuted }}>{u.business_unit || '—'}</td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {(u.allowedViews||[]).length === 0
                            ? <span style={{ fontSize:11, color:theme.color.textMuted }}>None</span>
                            : (u.allowedViews||[]).map(vid => {
                                const v = views.find(x => x.view_id===vid);
                                return v ? <span key={vid} style={{ background:theme.color.primaryLight, color:theme.color.primary, borderRadius:20, padding:'2px 8px', fontSize:10, fontWeight:600 }}>{v.view_name}</span> : null;
                              })}
                        </div>
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:u.active?'#F0FDF4':'#F9FAFB', color:u.active?'#16A34A':'#6B7280', border:`1px solid ${u.active?'#BBF7D0':'#E5E7EB'}`, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:600 }}>
                          {u.active ? <CheckCircle size={11}/> : <XCircle size={11}/>}
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={() => openEdit(u)} style={{ background:'none', border:`1px solid ${theme.color.border}`, borderRadius:6, padding:'5px 8px', cursor:'pointer', color:theme.color.textSecondary, display:'flex', alignItems:'center', gap:4, fontSize:12, transition:theme.transition.fast }}
                            onMouseEnter={e=>{e.currentTarget.style.borderColor=theme.color.primary;e.currentTarget.style.color=theme.color.primary;}}
                            onMouseLeave={e=>{e.currentTarget.style.borderColor=theme.color.border;e.currentTarget.style.color=theme.color.textSecondary;}}>
                            <Edit2 size={12}/> Edit
                          </button>
                          <button onClick={() => handleToggle(u.id)} style={{ background:'none', border:`1px solid ${theme.color.border}`, borderRadius:6, padding:'5px 8px', cursor:'pointer', color:theme.color.textSecondary, display:'flex', alignItems:'center', gap:4, fontSize:12, transition:theme.transition.fast }}
                            title={u.active?'Deactivate':'Activate'}>
                            {u.active ? <ToggleRight size={14} color='#16A34A'/> : <ToggleLeft size={14}/>}
                          </button>
                          {u.id !== currentUser.id && (
                            <button onClick={() => setDeleteConfirm(u)} style={{ background:'none', border:`1px solid ${theme.color.border}`, borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#DC2626', display:'flex', alignItems:'center', gap:4, fontSize:12, transition:theme.transition.fast }}
                              onMouseEnter={e=>{e.currentTarget.style.background='#FEF2F2';e.currentTarget.style.borderColor='#FECACA';}}
                              onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.borderColor=theme.color.border;}}>
                              <Trash2 size={12}/>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editingUser ? `Edit User — ${editingUser.name}` : 'Add New User'}
        subtitle={editingUser ? 'Update user details and permissions' : 'Create a new workbench user and assign view access'}
        width={620}
        footer={<>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} icon={editingUser ? Edit2 : Plus}>{editingUser ? 'Save Changes' : 'Create User'}</Button>
        </>}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {formErrors.general && (
            <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', color:'#DC2626', fontSize:13 }}>{formErrors.general}</div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Input label="Full Name *" value={form.name} onChange={e=>setField('name',e.target.value)} placeholder="Jane Doe" error={formErrors.name}/>
            <Input label="Username *"  value={form.username} onChange={e=>setField('username',e.target.value)} placeholder="j.doe" error={formErrors.username} disabled={!!editingUser}/>
            <Input label="Email *"     value={form.email} onChange={e=>setField('email',e.target.value)} placeholder="jane@bank.com" type="email" error={formErrors.email}/>
            <Input label={editingUser ? 'New Password (leave blank to keep)' : 'Password *'} value={form.password} onChange={e=>setField('password',e.target.value)} type="password" placeholder="••••••••" error={formErrors.password}/>
            <Select label="Role *" value={form.role} onChange={e=>setField('role',e.target.value)} options={ROLE_OPTIONS.map(r=>({value:r,label:r.charAt(0).toUpperCase()+r.slice(1)}))}/>
            <Select label="Status"  value={form.active} onChange={e=>setField('active',Number(e.target.value))} options={[{value:1,label:'Active'},{value:0,label:'Inactive'}]}/>
            <Input label="Group"     value={form.group} onChange={e=>setField('group',e.target.value)} placeholder="IB Team"/>
            <Input label="Business Unit" value={form.business_unit} onChange={e=>setField('business_unit',e.target.value)} placeholder="IB Americas"/>
          </div>

          {/* View access */}
          <div>
            <label style={{ display:'block', fontSize:12, fontWeight:600, color:theme.color.textSecondary, letterSpacing:'0.3px', marginBottom:8 }}>
              Alert View Access <span style={{ fontSize:11, color:theme.color.textMuted, fontWeight:400 }}>(select all views this user can access)</span>
            </label>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', padding:14, background:'#F8FAFC', border:`1.5px solid ${theme.color.border}`, borderRadius:theme.radius.md }}>
              {views.map(v => {
                const checked = form.allowedViews.includes(v.view_id);
                return (
                  <button key={v.view_id} type="button" onClick={() => toggleViewAccess(v.view_id)}
                    style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 14px', borderRadius:20, border:`1.5px solid ${checked?theme.color.primary:theme.color.border}`, background:checked?theme.color.primaryLight:'#fff', color:checked?theme.color.primary:theme.color.textSecondary, fontSize:12, fontWeight:checked?700:500, cursor:'pointer', transition:theme.transition.fast }}>
                    <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${checked?theme.color.primary:theme.color.borderMid}`, background:checked?theme.color.primary:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {checked && <span style={{ color:'#fff', fontSize:10, fontWeight:900, lineHeight:1 }}>✓</span>}
                    </div>
                    {v.view_name}
                  </button>
                );
              })}
              {views.length === 0 && <span style={{ fontSize:13, color:theme.color.textMuted }}>No views configured</span>}
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}
        title="Delete User"
        subtitle={`Are you sure you want to delete ${deleteConfirm?.name}? This action cannot be undone.`}
        width={420}
        footer={<>
          <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" icon={Trash2} onClick={() => handleDelete(deleteConfirm.id)}>Delete User</Button>
        </>}>
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:theme.radius.md, padding:16, fontSize:13, color:'#991B1B' }}>
          <strong>{deleteConfirm?.username}</strong> ({deleteConfirm?.email}) will be permanently removed from the system.
        </div>
      </Modal>
    </div>
  );
}
