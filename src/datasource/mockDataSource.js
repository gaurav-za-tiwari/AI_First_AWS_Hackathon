/**
 * mockDataSource.js
 * In-memory implementation of the datasource interface.
 * Mirrors the MySQL schema exactly — switch to apiDataSource.js for live DB.
 */

// ── Seed data ─────────────────────────────────────────────────────────────────
const VIEWS = [
  { view_id: 1, view_name: 'Party IB',  active: 1 },
  { view_id: 2, view_name: 'Party WMA', active: 1 },
  { view_id: 3, view_name: 'Party CB',  active: 1 },
];

const ROLES_MAP = {
  admin:      { can_view:1, can_edit:1, can_transition:1, can_assign:1, can_manage_users:1, can_view_all:1 },
  supervisor: { can_view:1, can_edit:1, can_transition:1, can_assign:1, can_manage_users:0, can_view_all:1 },
  analyst:    { can_view:1, can_edit:1, can_transition:1, can_assign:0, can_manage_users:0, can_view_all:0 },
  readonly:   { can_view:1, can_edit:0, can_transition:0, can_assign:0, can_manage_users:0, can_view_all:1 },
};

let USERS = [
  { id:1, name:'System Admin',     username:'admin',      email:'admin@amlbank.com',       password:'Admin@123',    role:'admin',      group:'Operations', business_unit:'Global',     view_id:1, active:1, allowedViews:[1,2,3], last_login:null },
  { id:2, name:'Jane Supervisor',  username:'supervisor', email:'j.super@amlbank.com',     password:'Super@123',    role:'supervisor', group:'IB Team',    business_unit:'IB',         view_id:1, active:1, allowedViews:[1,2,3], last_login:null },
  { id:3, name:'Alex Analyst',     username:'analyst1',   email:'a.analyst@amlbank.com',   password:'Analyst@123',  role:'analyst',    group:'IB Team',    business_unit:'IB Americas',view_id:1, active:1, allowedViews:[1],     last_login:null },
  { id:4, name:'Brett Analyst',    username:'analyst2',   email:'b.analyst@amlbank.com',   password:'Analyst@123',  role:'analyst',    group:'WMA Team',   business_unit:'WMA',        view_id:2, active:1, allowedViews:[1,2],   last_login:null },
  { id:5, name:'Carol Analyst',    username:'analyst3',   email:'c.analyst@amlbank.com',   password:'Analyst@123',  role:'analyst',    group:'CB Team',    business_unit:'CB',         view_id:3, active:1, allowedViews:[2,3],   last_login:null },
  { id:6, name:'Read Only User',   username:'readonly',   email:'readonly@amlbank.com',     password:'Read@123',     role:'readonly',   group:'Compliance', business_unit:'Global',     view_id:1, active:1, allowedViews:[1,2,3], last_login:null },
];

let ALERTS = [
  // Party IB (view_id: 1)
  { id:1,  business_unit:'IB Americas', view_id:1, Alert_ID:'ALT-00001', Customer_ID:'C10021', Customer_Name:'John Matthews',  Alert_Type:'AML IB Americas',  Alert_Type_ID:1, Score:87, Status:'Open',      Assigned_To:'analyst1',  Created_Date:'2024-01-15', Amount:250000,   Currency:'USD', Country:'US', Description:'Structuring - multiple cash deposits below threshold',           Priority:'High',     Action:null, Closure_Comment:null, Risk_Flags:['Structuring','Multiple Accounts'],  Processed_At:null },
  { id:2,  business_unit:'IB APAC',     view_id:1, Alert_ID:'ALT-00002', Customer_ID:'C10034', Customer_Name:'Sarah Chen',     Alert_Type:'AML IB APAC',      Alert_Type_ID:2, Score:91, Status:'In Review', Assigned_To:'analyst2',  Created_Date:'2024-01-16', Amount:520000,   Currency:'HKD', Country:'HK', Description:'Wire transfers to high-risk jurisdiction',                       Priority:'Critical', Action:null, Closure_Comment:null, Risk_Flags:['High-Risk Country','Wire Transfer'],Processed_At:null },
  { id:3,  business_unit:'IB EMEA',     view_id:1, Alert_ID:'ALT-00003', Customer_ID:'C10055', Customer_Name:'Carlos Rivera',  Alert_Type:'AML IB EMEA',      Alert_Type_ID:3, Score:73, Status:'Open',      Assigned_To:'analyst1',  Created_Date:'2024-01-17', Amount:80000,    Currency:'EUR', Country:'ES', Description:'Rapid movement of funds through multiple accounts',              Priority:'Medium',   Action:null, Closure_Comment:null, Risk_Flags:['Rapid Movement'],                  Processed_At:null },
  { id:4,  business_unit:'IB APAC',     view_id:1, Alert_ID:'ALT-00004', Customer_ID:'C10072', Customer_Name:'Priya Sharma',   Alert_Type:'AML IB APAC',      Alert_Type_ID:2, Score:95, Status:'Escalated',  Assigned_To:'supervisor', Created_Date:'2024-01-18', Amount:1200000,  Currency:'SGD', Country:'SG', Description:'Large cross-border transactions inconsistent with profile',       Priority:'Critical', Action:null, Closure_Comment:null, Risk_Flags:['PEP','Cross-Border','Large Amount'],Processed_At:null },
  { id:5,  business_unit:'IB Americas', view_id:1, Alert_ID:'ALT-00005', Customer_ID:'C10088', Customer_Name:'Michael Brown',  Alert_Type:'AML IB Americas',  Alert_Type_ID:1, Score:65, Status:'Open',      Assigned_To:'analyst2',  Created_Date:'2024-01-19', Amount:45000,    Currency:'USD', Country:'MX', Description:'Unusual cash activity for business type',                       Priority:'Low',      Action:null, Closure_Comment:null, Risk_Flags:['Cash Activity'],                   Processed_At:null },
  { id:6,  business_unit:'IB EMEA',     view_id:1, Alert_ID:'ALT-00006', Customer_ID:'C10093', Customer_Name:'Fatima Al-Said', Alert_Type:'AML IB EMEA',      Alert_Type_ID:3, Score:82, Status:'Closed',    Assigned_To:'analyst1',  Created_Date:'2024-01-20', Amount:310000,   Currency:'GBP', Country:'AE', Description:'Transactions linked to PEP network',                            Priority:'High',     Action:'Closed - SAR Filed', Closure_Comment:'SAR filed to FIU', Risk_Flags:['PEP','Sanctions'], Processed_At:'2024-01-25' },
  { id:7,  business_unit:'IB APAC',     view_id:1, Alert_ID:'ALT-00007', Customer_ID:'C10101', Customer_Name:'Zhang Wei',      Alert_Type:'AML IB APAC',      Alert_Type_ID:2, Score:78, Status:'Open',      Assigned_To:'analyst3',  Created_Date:'2024-01-21', Amount:680000,   Currency:'CNY', Country:'CN', Description:'Frequent round-number transactions',                            Priority:'Medium',   Action:null, Closure_Comment:null, Risk_Flags:['Structuring'],                     Processed_At:null },
  { id:8,  business_unit:'IB EMEA',     view_id:1, Alert_ID:'ALT-00008', Customer_ID:'C10115', Customer_Name:'Elena Petrov',   Alert_Type:'AML IB EMEA',      Alert_Type_ID:3, Score:88, Status:'In Review', Assigned_To:'analyst2',  Created_Date:'2024-01-22', Amount:420000,   Currency:'EUR', Country:'RU', Description:'Shell company involvement suspected',                            Priority:'High',     Action:null, Closure_Comment:null, Risk_Flags:['Shell Company','High-Risk Country'],Processed_At:null },
  // Party WMA (view_id: 2)
  { id:9,  business_unit:'WMA Americas',view_id:2, Alert_ID:'ALT-00101', Customer_ID:'W20011', Customer_Name:'Robert Kline',   Alert_Type:'AML WMA Americas', Alert_Type_ID:4, Score:76, Status:'Open',      Assigned_To:'analyst2',  Created_Date:'2024-01-15', Amount:900000,   Currency:'USD', Country:'US', Description:'Unusual portfolio liquidation pattern',                          Priority:'High',     Action:null, Closure_Comment:null, Risk_Flags:['Liquidation','Unusual Pattern'],    Processed_At:null },
  { id:10, business_unit:'WMA APAC',    view_id:2, Alert_ID:'ALT-00102', Customer_ID:'W20025', Customer_Name:'Mei Ling',       Alert_Type:'AML WMA APAC',     Alert_Type_ID:5, Score:84, Status:'In Review', Assigned_To:'analyst3',  Created_Date:'2024-01-16', Amount:2100000,  Currency:'HKD', Country:'HK', Description:'Transfer of wealth inconsistent with known sources',             Priority:'Critical', Action:null, Closure_Comment:null, Risk_Flags:['Source of Wealth','High Amount'],   Processed_At:null },
  { id:11, business_unit:'WMA EMEA',    view_id:2, Alert_ID:'ALT-00103', Customer_ID:'W20037', Customer_Name:'Oliver Smith',   Alert_Type:'AML WMA EMEA',     Alert_Type_ID:6, Score:67, Status:'Open',      Assigned_To:'analyst2',  Created_Date:'2024-01-17', Amount:550000,   Currency:'GBP', Country:'GB', Description:'Rapid in-and-out trading with no business rationale',           Priority:'Medium',   Action:null, Closure_Comment:null, Risk_Flags:['Rapid Trading'],                   Processed_At:null },
  { id:12, business_unit:'WMA EMEA',    view_id:2, Alert_ID:'ALT-00104', Customer_ID:'W20049', Customer_Name:'Ingrid Hansen',  Alert_Type:'AML WMA EMEA',     Alert_Type_ID:6, Score:92, Status:'Escalated',  Assigned_To:'supervisor', Created_Date:'2024-01-18', Amount:3400000,  Currency:'SEK', Country:'SE', Description:'Multiple beneficial owners - UBO verification failed',           Priority:'Critical', Action:null, Closure_Comment:null, Risk_Flags:['UBO','Multiple Owners'],            Processed_At:null },
  { id:13, business_unit:'WMA Africa',  view_id:2, Alert_ID:'ALT-00105', Customer_ID:'W20058', Customer_Name:'David Nkosi',    Alert_Type:'AML WMA Africa',   Alert_Type_ID:7, Score:71, Status:'Open',      Assigned_To:'analyst3',  Created_Date:'2024-01-19', Amount:120000,   Currency:'ZAR', Country:'ZA', Description:'Cross-border wire to unverified beneficiary',                   Priority:'Medium',   Action:null, Closure_Comment:null, Risk_Flags:['Unverified Beneficiary'],          Processed_At:null },
  // Party CB (view_id: 3)
  { id:14, business_unit:'CB Corporate',view_id:3, Alert_ID:'ALT-00201', Customer_ID:'B30001', Customer_Name:'Apex Holdings',  Alert_Type:'AML CB Corporate', Alert_Type_ID:8, Score:89, Status:'Open',      Assigned_To:'analyst3',  Created_Date:'2024-01-15', Amount:5200000,  Currency:'USD', Country:'KY', Description:'Large correspondent banking flow - high-risk domicile',          Priority:'Critical', Action:null, Closure_Comment:null, Risk_Flags:['Correspondent Banking','High-Risk'], Processed_At:null },
  { id:15, business_unit:'CB Trade',    view_id:3, Alert_ID:'ALT-00202', Customer_ID:'B30012', Customer_Name:'Solaris Trade',  Alert_Type:'AML CB Trade Finance',Alert_Type_ID:9,Score:74, Status:'In Review', Assigned_To:'analyst2',  Created_Date:'2024-01-16', Amount:780000,   Currency:'EUR', Country:'DE', Description:'Trade-based money laundering indicators',                       Priority:'High',     Action:null, Closure_Comment:null, Risk_Flags:['TBML','Invoice Fraud'],            Processed_At:null },
  { id:16, business_unit:'CB Corporate',view_id:3, Alert_ID:'ALT-00203', Customer_ID:'B30023', Customer_Name:'Pacific Bridge', Alert_Type:'AML CB Corporate', Alert_Type_ID:8, Score:61, Status:'Open',      Assigned_To:'analyst3',  Created_Date:'2024-01-17', Amount:330000,   Currency:'USD', Country:'PA', Description:'Frequent small transfers avoiding reporting threshold',           Priority:'Medium',   Action:null, Closure_Comment:null, Risk_Flags:['Structuring','Threshold Avoidance'],Processed_At:null },
  { id:17, business_unit:'CB Trade',    view_id:3, Alert_ID:'ALT-00204', Customer_ID:'B30031', Customer_Name:'Global Nexus',   Alert_Type:'AML CB Trade Finance',Alert_Type_ID:9,Score:95, Status:'Escalated',  Assigned_To:'supervisor', Created_Date:'2024-01-18', Amount:8900000,  Currency:'USD', Country:'HK', Description:'Phantom shipment documentation detected',                       Priority:'Critical', Action:null, Closure_Comment:null, Risk_Flags:['Phantom Shipment','TBML'],          Processed_At:null },
];

let auditLog = [];
let nextUserId = USERS.length + 1;

const WORKFLOW = {
  1: { 'Open':['In Review'],                      'In Review':['Escalated','Closed'],  'Escalated':['Closed','Rejected'] },
  2: { 'Open':['In Review','Escalated'],           'In Review':['Escalated','Closed'],  'Escalated':['Closed','Rejected'] },
  3: { 'Open':['In Review'],                       'In Review':['Escalated','Closed'],  'Escalated':['Closed'] },
  4: { 'Open':['In Review'],                       'In Review':['Closed','Rejected'] },
  5: { 'Open':['In Review'],                       'In Review':['Escalated'],           'Escalated':['Closed'] },
  6: { 'Open':['In Review'],                       'In Review':['Escalated','Closed'],  'Escalated':['Closed','Rejected'] },
  7: { 'Open':['In Review'],                       'In Review':['Closed'] },
  8: { 'Open':['In Review'],                       'In Review':['Escalated','Closed'],  'Escalated':['Closed','Rejected'] },
  9: { 'Open':['In Review'],                       'In Review':['Escalated'],           'Escalated':['Closed','Rejected'] },
};

// ── Datasource interface implementation ───────────────────────────────────────

export async function login(username, password) {
  await delay(300);
  const user = USERS.find(u => u.username === username && u.password === password && u.active);
  if (!user) throw new Error('Invalid credentials');
  user.last_login = new Date().toISOString();
  const { password: _, ...safeUser } = user;
  return { token: `mock-token-${user.id}`, user: safeUser };
}

export async function getViews(user) {
  await delay(100);
  return VIEWS.filter(v => v.active && user.allowedViews.includes(v.view_id));
}

export async function getAllViews() {
  await delay(100);
  return VIEWS;
}

export async function getAlerts({ view_id, status, priority, search, page=1, limit=20, sort='Score', dir='DESC', user }) {
  await delay(200);
  let list = [...ALERTS];

  // View access filter
  if (user.role !== 'admin' && user.role !== 'supervisor') {
    list = list.filter(a => user.allowedViews.includes(a.view_id));
  }
  if (view_id) list = list.filter(a => a.view_id === Number(view_id));
  if (user.role === 'analyst') list = list.filter(a => a.Assigned_To === user.username);
  if (status)   list = list.filter(a => a.Status === status);
  if (priority) list = list.filter(a => a.Priority === priority);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(a => ['Alert_ID','Customer_Name','Description','Alert_Type'].some(k => String(a[k]||'').toLowerCase().includes(q)));
  }

  list.sort((a,b) => {
    const va = a[sort] ?? ''; const vb = b[sort] ?? '';
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return dir === 'ASC' ? cmp : -cmp;
  });

  const total = list.length;
  const paginated = list.slice((page-1)*limit, page*limit);
  return { alerts: paginated, total, page, limit };
}

export async function getAlertById(alertId) {
  await delay(100);
  return ALERTS.find(a => a.Alert_ID === alertId) || null;
}

export async function updateAlertStatus(alertId, { status, comment, action, fromStatus, userId, userName }) {
  await delay(200);
  const idx = ALERTS.findIndex(a => a.Alert_ID === alertId);
  if (idx === -1) throw new Error('Alert not found');
  ALERTS[idx] = { ...ALERTS[idx], Status: status, Action: action||null, Closure_Comment: comment||null, Processed_At: new Date().toISOString() };
  auditLog.unshift({ id: auditLog.length+1, alert_id: alertId, user_id: userId, user_name: userName, from_status: fromStatus, to_status: status, comment, action_type:'TRANSITION', created_at: new Date().toISOString() });
  return { success: true };
}

export async function getAuditLog(alertId) {
  await delay(100);
  return auditLog.filter(e => e.alert_id === alertId);
}

export async function getWorkflow(alertTypeId) {
  await delay(50);
  return WORKFLOW[alertTypeId] || {};
}

export async function getUsers() {
  await delay(150);
  return USERS.map(({ password: _, ...u }) => u);
}

export async function createUser(data) {
  await delay(200);
  if (USERS.find(u => u.username === data.username)) throw new Error('Username already exists');
  if (USERS.find(u => u.email === data.email)) throw new Error('Email already exists');
  const newUser = { ...data, id: nextUserId++, last_login: null, active: data.active ?? 1, allowedViews: data.allowedViews || [] };
  USERS.push(newUser);
  return { id: newUser.id };
}

export async function updateUser(id, data) {
  await delay(200);
  const idx = USERS.findIndex(u => u.id === Number(id));
  if (idx === -1) throw new Error('User not found');
  USERS[idx] = { ...USERS[idx], ...data, id: USERS[idx].id };
  return { success: true };
}

export async function toggleUserActive(id) {
  await delay(150);
  const user = USERS.find(u => u.id === Number(id));
  if (user) user.active = user.active ? 0 : 1;
  return { success: true };
}

export async function deleteUser(id, currentUserId) {
  await delay(150);
  if (Number(id) === currentUserId) throw new Error('Cannot delete your own account');
  USERS = USERS.filter(u => u.id !== Number(id));
  return { success: true };
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
