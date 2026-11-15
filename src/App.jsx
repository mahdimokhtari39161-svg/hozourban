import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, Camera, Check, ChevronDown, Clock3, Download, LayoutDashboard, LogOut, Menu, Search, ShieldCheck, Users, UserRound, X } from 'lucide-react';

const initialPeople = [
  { id: '1001', name: 'علی رضایی', role: 'اپراتور خط تولید', shift: '۰۷:۰۰ تا ۱۵:۰۰', status: 'حاضر', time: '۰۷:۰۳', pin: '1234' },
  { id: '1002', name: 'محمد کریمی', role: 'انباردار', shift: '۰۷:۰۰ تا ۱۵:۰۰', status: 'حاضر', time: '۰۷:۱۱', pin: '1234' },
  { id: '1003', name: 'حسین احمدی', role: 'تکنسین فنی', shift: '۰۸:۰۰ تا ۱۶:۰۰', status: 'مرخصی', time: '—', pin: '1234' },
  { id: '1004', name: 'رضا محمدی', role: 'راننده', shift: '۰۷:۰۰ تا ۱۵:۰۰', status: 'غایب', time: '—', pin: '1234' },
  { id: '1005', name: 'امیر موسوی', role: 'کارشناس فروش', shift: '۰۸:۰۰ تا ۱۶:۰۰', status: 'حاضر', time: '۰۸:۰۲', pin: '1234' },
];
const faDate = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const faTime = () => new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());

export default function App() {
  const [people, setPeople] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hozourban-people')) || initialPeople; } catch { return initialPeople; }
  });
  const [events, setEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hozourban-events')) || []; } catch { return []; }
  });
  const [tab, setTab] = useState('dashboard');
  const [query, setQuery] = useState('');
  const [pin, setPin] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [notice, setNotice] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState('');
  const [streamError, setStreamError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [clock, setClock] = useState(faTime());

  useEffect(() => { const t = setInterval(() => setClock(faTime()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { localStorage.setItem('hozourban-people', JSON.stringify(people)); }, [people]);
  useEffect(() => { localStorage.setItem('hozourban-events', JSON.stringify(events)); }, [events]);
  useEffect(() => {
    if (!cameraOpen) return;
    let active = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(s => { if (active && videoRef.current) videoRef.current.srcObject = s; else s.getTracks().forEach(t => t.stop()); })
      .catch(() => setStreamError('دسترسی به دوربین ممکن نیست. مجوز دوربین مرورگر را بررسی کنید.'));
    return () => { active = false; videoRef.current?.srcObject?.getTracks().forEach(t => t.stop()); };
  }, [cameraOpen]);

  const present = people.filter(p => p.status === 'حاضر').length;
  const filtered = useMemo(() => people.filter(p => (p.name + p.id + p.role).includes(query.trim())), [people, query]);
  const todayEvents = events.filter(e => e.date === new Date().toLocaleDateString('en-CA'));
  const notify = message => { setNotice(message); setTimeout(() => setNotice(''), 3200); };

  const startCamera = () => { setPhoto(''); setStreamError(''); setCameraOpen(true); };
  const takePhoto = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || !v.videoWidth) { setStreamError('تصویر دوربین هنوز آماده نیست.'); return; }
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    setPhoto(c.toDataURL('image/jpeg', .72));
    v.srcObject?.getTracks().forEach(t => t.stop());
  };
  const submitAttendance = kind => {
    const person = people.find(p => p.id === employeeId && p.pin === pin);
    if (!person) { notify('کد پرسنلی یا رمز عبور صحیح نیست.'); return; }
    if (!photo) { notify('برای ثبت تردد ابتدا عکس بگیرید.'); return; }
    const event = { id: crypto.randomUUID(), employeeId, name: person.name, kind, time: clock, date: new Date().toLocaleDateString('en-CA'), photo };
    setEvents(old => [event, ...old]);
    setPeople(old => old.map(p => p.id === employeeId ? { ...p, status: kind === 'ورود' ? 'حاضر' : 'خارج‌شده', time: clock.slice(0,5) } : p));
    setCameraOpen(false); setPin(''); setEmployeeId(''); setPhoto('');
    notify('تردد با موفقیت در این دستگاه ثبت شد.');
  };
  const exportCsv = () => {
    const rows = [['نام', 'کد پرسنلی', 'نوع تردد', 'تاریخ', 'ساعت'], ...events.map(e => [e.name, e.employeeId, e.kind, e.date, e.time])];
    const csv = '\ufeff' + rows.map(r => r.map(x => '"' + String(x).replaceAll('"','""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'hozourban-report.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={23}/></div><div><b>حضوربان</b><small>سامانه مدیریت منابع انسانی</small></div></div>
      <div className="company-switch"><div className="company-icon">خ</div><div><b>کارخانه خورشید نو</b><small>شعبه اصلی · اصفهان</small></div><ChevronDown size={16}/></div>
      <div className="nav-caption">منوی اصلی</div>
      <button className={tab==='dashboard'?'nav-item active':'nav-item'} onClick={()=>setTab('dashboard')}><LayoutDashboard size={18}/> نمای کلی</button>
      <button className={tab==='employees'?'nav-item active':'nav-item'} onClick={()=>setTab('employees')}><Users size={18}/> کارکنان</button>
      <button className={tab==='attendance'?'nav-item active':'nav-item'} onClick={()=>setTab('attendance')}><Clock3 size={18}/> ترددها و گزارش‌ها</button>
      <button className={tab==='kiosk'?'nav-item active':'nav-item'} onClick={()=>setTab('kiosk')}><Camera size={18}/> دستگاه حضور و غیاب</button>
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={18}/><span>محیط آزمایشی حضوربان<br/><small>اطلاعات روی همین مرورگر ذخیره می‌شود</small></span></div><div className="user-mini"><div className="avatar">م</div><div><b>مدیر سیستم</b><small>مدیر منابع انسانی</small></div><LogOut size={17}/></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="crumb">کارخانه خورشید نو <span>/</span> {({dashboard:'نمای کلی',employees:'مدیریت کارکنان',attendance:'گزارش ترددها',kiosk:'ثبت تردد'})[tab]}</div><h1>{({dashboard:'داشبورد مدیریتی',employees:'مدیریت کارکنان',attendance:'ترددها و گزارش‌ها',kiosk:'دستگاه حضور و غیاب'})[tab]}</h1></div><div className="top-actions"><div className="date-chip"><Clock3 size={16}/><span>{clock}</span></div><button className="icon-btn" aria-label="اعلان‌ها"><Bell size={19}/><i/></button><div className="avatar">م</div></div></header>
      {tab==='dashboard' && <section className="content">
        <div className="welcome"><div><span className="eyebrow">گزارش لحظه‌ای مجموعه</span><h2>روز بخیر، مدیر عزیز 👋</h2><p>{faDate.format(new Date())} · وضعیت نیروی انسانی در یک نگاه</p></div><button className="primary-btn" onClick={()=>setTab('kiosk')}><Camera size={17}/> ثبت ورود و خروج</button></div>
        <div className="stats-grid">
          <Stat icon={<Users/>} label="کل کارکنان" value={people.length} note="نیروی ثبت‌شده" tone="blue"/>
          <Stat icon={<Check/>} label="حاضر در مجموعه" value={present} note="در حال فعالیت" tone="green"/>
          <Stat icon={<Clock3/>} label="غایب امروز" value={people.filter(p=>p.status==='غایب').length} note="نیازمند بررسی" tone="orange"/>
          <Stat icon={<ArrowUpRight/>} label="ترددهای امروز" value={todayEvents.length} note="ورود و خروج ثبت‌شده" tone="purple"/>
        </div>
        <div className="dashboard-grid"><div className="panel"><div className="panel-head"><div><h3>وضعیت حضور کارکنان</h3><p>آخرین وضعیت ثبت‌شده پرسنل</p></div><button className="text-btn" onClick={()=>setTab('employees')}>مشاهده همه</button></div><PeopleTable people={people.slice(0,5)}/></div>
        <div className="panel activity-panel"><div className="panel-head"><div><h3>آخرین ترددها</h3><p>رویدادهای ثبت‌شده در دستگاه</p></div><Activity size={19}/></div>{events.slice(0,5).length ? events.slice(0,5).map(e=><div className="event-row" key={e.id}><div className={e.kind==='ورود'?'event-icon in':'event-icon out'}>{e.kind==='ورود'?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</div><div className="event-info"><b>{e.name}</b><small>{e.kind} · {e.date}</small></div><time>{e.time}</time></div>) : <div className="empty"><Clock3 size={26}/><b>هنوز ترددی ثبت نشده</b><span>پس از اولین ثبت ورود یا خروج، رویدادها اینجا نمایش داده می‌شوند.</span></div>}</div></div>
        <div className="notice-bar"><ShieldCheck size={19}/><span><b>یادآوری امنیتی:</b> این نسخه، نمونه اولیه رابط کاربری است. برای استفاده واقعی باید سرور، احراز هویت امن، پایگاه داده و کنترل دسترسی راه‌اندازی شود.</span></div>
      </section>}
      {tab==='employees' && <section className="content"><div className="section-toolbar"><div><h2>فهرست کارکنان</h2><p>اطلاعات پایه و وضعیت کاری پرسنل</p></div><div className="search-box"><Search size={17}/><input placeholder="جست‌وجوی نام، کد یا سمت..." value={query} onChange={e=>setQuery(e.target.value)}/></div></div><div className="panel"><PeopleTable people={filtered}/></div></section>}
      {tab==='attendance' && <section className="content"><div className="section-toolbar"><div><h2>تاریخچه تردد</h2><p>تمام ورودها و خروج‌های ثبت‌شده در این مرورگر</p></div><button className="outline-btn" onClick={exportCsv}><Download size={17}/> خروجی Excel / CSV</button></div><div className="panel"><div className="table-wrap"><table><thead><tr><th>کارمند</th><th>کد پرسنلی</th><th>نوع تردد</th><th>تاریخ</th><th>ساعت</th><th>عکس</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td><b>{e.name}</b></td><td>{e.employeeId}</td><td><span className={e.kind==='ورود'?'status present':'status away'}>{e.kind}</span></td><td>{e.date}</td><td>{e.time}</td><td>{e.photo?<a href={e.photo} target="_blank" rel="noreferrer">مشاهده عکس</a>:'—'}</td></tr>)}</tbody></table>{!events.length&&<div className="empty"><Clock3 size={28}/><b>گزارشی برای نمایش وجود ندارد</b><span>ترددهای ثبت‌شده در این بخش فهرست می‌شوند.</span></div>}</div></div></section>}
      {tab==='kiosk' && <section className="content kiosk-content"><div className="kiosk-intro"><div className="kiosk-symbol"><Camera size={27}/></div><span className="eyebrow">کیوسک ورودی کارخانه</span><h2>ثبت ورود و خروج کارکنان</h2><p>کد پرسنلی و رمز خود را وارد کنید، سپس عکس لحظه‌ای بگیرید.</p></div><div className="kiosk-card"><div className="kiosk-time">{clock}</div><div className="kiosk-date">{faDate.format(new Date())}</div><div className="field"><label>کد پرسنلی</label><input inputMode="numeric" placeholder="مثلاً ۱۰۰۱" value={employeeId} onChange={e=>setEmployeeId(e.target.value)} /></div><div className="field"><label>رمز عبور</label><input type="password" inputMode="numeric" placeholder="رمز چهاررقمی آزمایشی" value={pin} onChange={e=>setPin(e.target.value)}/></div>{photo?<div className="photo-preview"><img src={photo} alt="تصویر ثبت‌شده"/><button className="retake" onClick={startCamera}>گرفتن عکس مجدد</button></div>:<button className="camera-btn" onClick={startCamera}><Camera size={18}/> فعال‌کردن دوربین و گرفتن عکس</button>}<div className="kiosk-buttons"><button className="entry-btn" onClick={()=>submitAttendance('ورود')}><ArrowDownLeft size={18}/> ثبت ورود</button><button className="exit-btn" onClick={()=>submitAttendance('خروج')}><ArrowUpRight size={18}/> ثبت خروج</button></div><p className="demo-hint">حساب‌های آزمایشی: کدهای ۱۰۰۱ تا ۱۰۰۵ · رمز همه: ۱۲۳۴</p></div></section>}
    </main>
    {notice&&<div className="toast"><Check size={18}/>{notice}</div>}
    {cameraOpen&&<div className="modal-backdrop"><div className="camera-modal"><div className="modal-head"><b>ثبت تصویر پرسنل</b><button className="icon-btn" onClick={()=>setCameraOpen(false)}><X/></button></div><div className="video-frame">{photo?<img src={photo} alt="پیش‌نمایش"/>:<video ref={videoRef} autoPlay playsInline muted/>}</div>{streamError&&<p className="error-text">{streamError}</p>}<button className="primary-btn full" onClick={takePhoto}><Camera size={18}/> ثبت عکس</button><canvas ref={canvasRef} hidden/></div></div>}
  </div>;
}

function Stat({icon,label,value,note,tone}) { return <div className="stat-card"><div className={'stat-icon '+tone}>{icon}</div><div className="stat-label">{label}</div><strong>{value}</strong><small>{note}</small></div>; }
function PeopleTable({people}) { return <div className="table-wrap"><table><thead><tr><th>نام و نام خانوادگی</th><th>کد پرسنلی</th><th>سمت سازمانی</th><th>شیفت</th><th>وضعیت</th></tr></thead><tbody>{people.map(p=><tr key={p.id}><td><div className="person-cell"><div className="person-avatar">{p.name.slice(0,1)}</div><b>{p.name}</b></div></td><td>{p.id}</td><td>{p.role}</td><td>{p.shift}</td><td><span className={'status '+(p.status==='حاضر'?'present':p.status==='غایب'?'absent':'away')}>{p.status}</span></td></tr>)}</tbody></table>{!people.length&&<div className="empty">کارمندی پیدا نشد.</div>}</div>; }
