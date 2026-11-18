import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Users, Clock3, LogOut, Settings, RefreshCw, Download, Plus, Check, X, ShieldCheck, CalendarDays, Wifi, WifiOff } from 'lucide-react';
import { apiRequest, checkServer, connectionSettings } from './lib/api.js';

const faDate = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const faTime = () => new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
const labels = { dashboard: 'داشبورد', employees: 'کارکنان', attendance: 'ترددها', leave: 'مرخصی‌ها', kiosk: 'ثبت تردد', settings: 'اتصال سرور' };

export default function App() {
  const [settings, setSettings] = useState(connectionSettings.get());
  const [user, setUser] = useState(connectionSettings.user());
  const [tab, setTab] = useState('dashboard');
  const [serverStatus, setServerStatus] = useState('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(faTime());
  const [employees, setEmployees] = useState([]);
  const [events, setEvents] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [query, setQuery] = useState('');
  const [login, setLogin] = useState({ employeeCode: '', password: '' });
  const [newEmployee, setNewEmployee] = useState({ employeeCode: '', name: '', jobTitle: '', password: '', role: 'employee' });
  const [attendance, setAttendance] = useState({ employeeCode: '', kind: 'in' });
  const [leave, setLeave] = useState({ type: 'annual', startsAt: '', endsAt: '', reason: '' });

  useEffect(() => { const timer = setInterval(() => setClock(faTime()), 1000); return () => clearInterval(timer); }, []);
  const notify = message => { setNotice(message); window.setTimeout(() => setNotice(''), 3500); };
  const loadData = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [people, attendanceData, leaveData] = await Promise.all([
        apiRequest('/api/employees'),
        apiRequest('/api/attendance'),
        apiRequest('/api/leave'),
      ]);
      setEmployees(people.employees || []);
      setEvents(attendanceData.events || []);
      setLeaves(leaveData.requests || []);
      setServerStatus('online');
    } catch (e) { setError(e.message); if (/ارتباط|آدرس سرور/.test(e.message)) setServerStatus('offline'); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { if (user && connectionSettings.token()) loadData(); }, [user, loadData]);

  const saveConnection = async () => {
    setError('');
    try {
      connectionSettings.save(settings);
      await checkServer();
      setServerStatus('online');
      notify('اتصال به سرور برقرار شد.');
    } catch (e) { setServerStatus('offline'); setError(e.message); }
  };
  const doLogin = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      connectionSettings.save(settings);
      const data = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ organizationId: settings.organizationId, ...login }) });
      connectionSettings.setSession(data); setUser(data.user); setTab('dashboard'); notify('با موفقیت وارد شدید.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const logout = () => { connectionSettings.clearSession(); setUser(null); setEmployees([]); setEvents([]); setLeaves([]); };
  const addEmployee = async e => {
    e.preventDefault(); setError('');
    try {
      if (!user?.branchId) throw new Error('شناسه شعبه در حساب مدیر موجود نیست؛ تنظیمات اولیه سرور باید اصلاح شود.');
      await apiRequest('/api/employees', { method: 'POST', body: JSON.stringify({ ...newEmployee, branchId: user.branchId }) });
      setNewEmployee({ employeeCode: '', name: '', jobTitle: '', password: '', role: 'employee' });
      await loadData(); notify('کارمند به پایگاه داده مرکزی اضافه شد.');
    } catch (e) { setError(e.message); }
  };
  const recordAttendance = async e => {
    e.preventDefault(); setError('');
    try {
      await apiRequest('/api/attendance', { method: 'POST', body: JSON.stringify(attendance) });
      await loadData(); notify('تردد در سرور مرکزی ثبت شد.');
    } catch (e) { setError(e.message); }
  };
  const submitLeave = async e => {
    e.preventDefault(); setError('');
    try {
      await apiRequest('/api/leave', { method: 'POST', body: JSON.stringify(leave) });
      setLeave({ type: 'annual', startsAt: '', endsAt: '', reason: '' });
      await loadData(); notify('درخواست مرخصی ثبت شد.');
    } catch (e) { setError(e.message); }
  };
  const reviewLeave = async (id, status) => {
    try { await apiRequest('/api/leave/' + id + '/review', { method: 'PATCH', body: JSON.stringify({ status }) }); await loadData(); }
    catch (e) { setError(e.message); }
  };
  const exportCsv = () => {
    const rows = [['نام', 'کد پرسنلی', 'نوع', 'زمان']];
    events.forEach(x => rows.push([x.full_name, x.employee_code, x.kind, new Date(x.occurred_at).toLocaleString('fa-IR')]));
    const csv = '\ufeff' + rows.map(r => r.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'hozourban-attendance.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  const filtered = useMemo(() => employees.filter(p => (p.full_name + p.employee_code + (p.job_title || '')).includes(query.trim())), [employees, query]);
  const isManager = ['owner', 'admin', 'hr'].includes(user?.role);

  if (!user) return <div className="login-shell"><div className="login-card">
    <div className="login-brand"><div className="brand-mark"><Activity size={24}/></div><div><b>حضوربان</b><small>سامانه مرکزی حضور و غیاب</small></div></div>
    <h1>اتصال به سامانه کارخانه</h1><p>برای استفاده از اطلاعات واقعی، ابتدا سرور مرکزی را تنظیم و سپس وارد شوید.</p>
    <form onSubmit={doLogin}>
      <label>آدرس سرور API</label><input dir="ltr" placeholder="https://your-server.example.com" value={settings.baseUrl} onChange={e=>setSettings(s=>({...s,baseUrl:e.target.value}))} required/>
      <label>شناسه سازمان (Organization ID)</label><input dir="ltr" placeholder="UUID سازمان" value={settings.organizationId} onChange={e=>setSettings(s=>({...s,organizationId:e.target.value}))} required/>
      <div className="form-divider"/>
      <label>کد کاربری</label><input autoComplete="username" value={login.employeeCode} onChange={e=>setLogin(s=>({...s,employeeCode:e.target.value}))} required/>
      <label>رمز عبور</label><input type="password" autoComplete="current-password" value={login.password} onChange={e=>setLogin(s=>({...s,password:e.target.value}))} required/>
      {error && <div className="error-box">{error}</div>}
      <button className="primary-btn full" disabled={busy}>{busy ? 'در حال اتصال...' : 'اتصال و ورود'}</button>
    </form>
    <button className="secondary-wide" onClick={saveConnection}><Wifi size={16}/> فقط بررسی اتصال سرور</button>
    <small className="connection-note">اطلاعات ورود آزمایشی قبلی حذف شده‌اند. برای ورود باید مدیر اولیه را روی سرور بسازید.</small>
  </div>{notice && <div className="toast">{notice}</div>}</div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={23}/></div><div><b>حضوربان</b><small>سامانه مدیریت منابع انسانی</small></div></div>
      <div className="company-switch"><div className="company-icon">خ</div><div><b>کارخانه خورشید نو</b><small>سامانه متصل به سرور</small></div></div>
      <div className="nav-caption">منوی اصلی</div>
      {['dashboard','employees','attendance','leave','kiosk','settings'].map(key=><button key={key} className={tab===key?'nav-item active':'nav-item'} onClick={()=>setTab(key)}>{key==='dashboard'?<Activity size={18}/>:key==='employees'?<Users size={18}/>:key==='attendance'?<Clock3 size={18}/>:key==='leave'?<CalendarDays size={18}/>:key==='kiosk'?<Check size={18}/>:<Settings size={18}/>} {labels[key]}</button>)}
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={18}/><span>اتصال مرکزی<br/><small>{serverStatus==='online'?'سرور در دسترس است':'وضعیت اتصال بررسی نشده'}</small></span></div><div className="user-mini"><div className="avatar">{(user.name||'م').slice(0,1)}</div><div><b>{user.name}</b><small>{user.role}</small></div><button className="icon-btn" onClick={logout} title="خروج"><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="crumb">کارخانه خورشید نو <span>/</span> {labels[tab]}</div><h1>{labels[tab]}</h1></div><div className="top-actions"><div className="date-chip"><Clock3 size={16}/><span>{clock}</span></div><button className="icon-btn" onClick={loadData} title="همگام‌سازی"><RefreshCw size={18}/></button><div className="avatar">{(user.name||'م').slice(0,1)}</div></div></header>
      {error && <div className="error-banner"><WifiOff size={17}/>{error}<button onClick={()=>setError('')}><X size={16}/></button></div>}
      {tab==='dashboard' && <section className="content"><div className="welcome"><div><span className="eyebrow">گزارش سرور مرکزی</span><h2>روز بخیر، {user.name} 👋</h2><p>{faDate.format(new Date())} · داده‌های دریافت‌شده از پایگاه داده مرکزی</p></div><button className="primary-btn" onClick={()=>setTab('kiosk')}>ثبت تردد</button></div><div className="stats-grid"><Stat label="کل کارکنان" value={employees.length}/><Stat label="رویدادهای تردد" value={events.length}/><Stat label="درخواست‌های در انتظار" value={leaves.filter(x=>x.status==='pending').length}/><Stat label="وضعیت سرور" value={serverStatus==='online'?'متصل':'نامشخص'}/></div><div className="panel"><div className="panel-head"><div><h3>آخرین ترددها</h3><p>آخرین رویدادهای ثبت‌شده در سرور</p></div><button className="text-btn" onClick={loadData}>به‌روزرسانی</button></div><EventsTable events={events.slice(0,10)}/></div></section>}
      {tab==='employees' && <section className="content"><div className="section-toolbar"><div><h2>کارکنان</h2><p>فهرست همگام‌شده با سرور مرکزی</p></div><input className="search-input" placeholder="جست‌وجو..." value={query} onChange={e=>setQuery(e.target.value)}/></div>{isManager && <form className="panel form-grid" onSubmit={addEmployee}><h3>افزودن کارمند</h3><input placeholder="کد پرسنلی" value={newEmployee.employeeCode} onChange={e=>setNewEmployee(s=>({...s,employeeCode:e.target.value}))} required/><input placeholder="نام و نام خانوادگی" value={newEmployee.name} onChange={e=>setNewEmployee(s=>({...s,name:e.target.value}))} required/><input placeholder="عنوان شغلی" value={newEmployee.jobTitle} onChange={e=>setNewEmployee(s=>({...s,jobTitle:e.target.value}))}/><input type="password" minLength="10" placeholder="رمز اولیه (حداقل ۱۰ کاراکتر)" value={newEmployee.password} onChange={e=>setNewEmployee(s=>({...s,password:e.target.value}))} required/><select value={newEmployee.role} onChange={e=>setNewEmployee(s=>({...s,role:e.target.value}))}><option value="employee">کارمند</option><option value="hr">منابع انسانی</option><option value="kiosk">کیوسک</option></select><button className="primary-btn"><Plus size={16}/> افزودن</button></form>}<div className="panel"><PeopleTable people={filtered}/></div></section>}
      {tab==='attendance' && <section className="content"><div className="section-toolbar"><div><h2>گزارش تردد</h2><p>سوابق ثبت‌شده روی سرور</p></div><button className="outline-btn" onClick={exportCsv}><Download size={16}/> خروجی CSV</button></div><div className="panel"><EventsTable events={events}/></div></section>}
      {tab==='kiosk' && <section className="content kiosk-content"><div className="kiosk-intro"><div className="kiosk-symbol"><Check size={27}/></div><h2>ثبت ورود و خروج</h2><p>ثبت مستقیم در پایگاه داده مرکزی با زمان سرور</p></div><form className="kiosk-card" onSubmit={recordAttendance}><div className="kiosk-time">{clock}</div><div className="kiosk-date">{faDate.format(new Date())}</div><label>کد پرسنلی</label><input value={attendance.employeeCode} onChange={e=>setAttendance(s=>({...s,employeeCode:e.target.value}))} required/><label>نوع تردد</label><select value={attendance.kind} onChange={e=>setAttendance(s=>({...s,kind:e.target.value}))}><option value="in">ورود</option><option value="out">خروج</option><option value="break_start">شروع استراحت</option><option value="break_end">پایان استراحت</option></select><button className="primary-btn full" disabled={busy}>ثبت در سرور</button><small className="connection-note">این نسخه ثبت عکس را تا زمان راه‌اندازی امن فضای ذخیره‌سازی تصویر فعال نمی‌کند.</small></form></section>}
      {tab==='leave' && <section className="content"><div className="section-toolbar"><div><h2>درخواست‌های مرخصی</h2><p>ثبت و بررسی درخواست‌ها</p></div></div><form className="panel form-grid" onSubmit={submitLeave}><h3>ثبت درخواست جدید</h3><select value={leave.type} onChange={e=>setLeave(s=>({...s,type:e.target.value}))}><option value="annual">استحقاقی</option><option value="sick">استعلاجی</option><option value="unpaid">بدون حقوق</option><option value="mission">مأموریت</option></select><label>از تاریخ</label><input type="date" value={leave.startsAt} onChange={e=>setLeave(s=>({...s,startsAt:e.target.value}))} required/><label>تا تاریخ</label><input type="date" value={leave.endsAt} onChange={e=>setLeave(s=>({...s,endsAt:e.target.value}))} required/><input placeholder="توضیحات (اختیاری)" value={leave.reason} onChange={e=>setLeave(s=>({...s,reason:e.target.value}))}/><button className="primary-btn">ثبت درخواست</button></form><div className="panel leave-list">{leaves.map(x=><div className="leave-row" key={x.id}><div><b>{x.full_name || 'درخواست من'} · {x.leave_type}</b><small>{x.starts_at} تا {x.ends_at} · {x.status}</small></div>{isManager&&x.status==='pending'&&<div><button className="approve" onClick={()=>reviewLeave(x.id,'approved')}>تأیید</button><button className="reject" onClick={()=>reviewLeave(x.id,'rejected')}>رد</button></div>}</div>)}{!leaves.length&&<div className="empty">درخواستی ثبت نشده است.</div>}</div></section>}
      {tab==='settings' && <section className="content"><div className="panel settings-panel"><h2>تنظیمات اتصال</h2><p>آدرس سرور و شناسه سازمان را تنظیم کنید. تغییر آدرس، نشست فعلی را خارج می‌کند.</p><label>آدرس API</label><input dir="ltr" value={settings.baseUrl} onChange={e=>setSettings(s=>({...s,baseUrl:e.target.value}))}/><label>شناسه سازمان</label><input dir="ltr" value={settings.organizationId} onChange={e=>setSettings(s=>({...s,organizationId:e.target.value}))}/><button className="primary-btn" onClick={async()=>{logout();await saveConnection();}}>ذخیره و آزمایش اتصال</button><p className="connection-note">وضعیت فعلی: {serverStatus==='online'?'متصل':'اتصال تأیید نشده'}</p></div></section>}
    </main>{notice&&<div className="toast"><Check size={17}/>{notice}</div>}
  </div>;
}

function Stat({label,value}) { return <div className="stat-card"><div className="stat-icon green"><Activity size={19}/></div><div className="stat-label">{label}</div><strong>{value}</strong></div>; }
function PeopleTable({people}) { return <div className="table-wrap"><table><thead><tr><th>نام</th><th>کد پرسنلی</th><th>عنوان شغلی</th><th>نقش</th><th>وضعیت</th></tr></thead><tbody>{people.map(p=><tr key={p.id}><td><b>{p.full_name}</b></td><td>{p.employee_code}</td><td>{p.job_title||'—'}</td><td>{p.role}</td><td><span className={'status '+(p.active?'present':'absent')}>{p.active?'فعال':'غیرفعال'}</span></td></tr>)}</tbody></table>{!people.length&&<div className="empty">کارمندی برای نمایش وجود ندارد.</div>}</div>; }
function EventsTable({events}) { return <div className="table-wrap"><table><thead><tr><th>نام</th><th>کد پرسنلی</th><th>نوع تردد</th><th>زمان ثبت‌شده</th></tr></thead><tbody>{events.map(x=><tr key={x.id}><td>{x.full_name}</td><td>{x.employee_code}</td><td>{({in:'ورود',out:'خروج',break_start:'شروع استراحت',break_end:'پایان استراحت'})[x.kind]||x.kind}</td><td>{new Date(x.occurred_at).toLocaleString('fa-IR')}</td></tr>)}</tbody></table>{!events.length&&<div className="empty">ترددی ثبت نشده است.</div>}</div>; }
