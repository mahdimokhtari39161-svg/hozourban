import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined });
const app = express();
app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = new Set([
  'https://localhost',
  'capacitor://localhost',
  'http://localhost',
  'http://localhost:5173',
  ...(process.env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean),
]);
app.use(cors({
  origin(origin, callback) {
    // Native Capacitor requests may omit Origin; browser origins must be allow-listed.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const sign = user => jwt.sign({ sub:user.id, org:user.organization_id, branch:user.branch_id, role:user.role }, process.env.JWT_SECRET, { expiresIn:'8h', issuer:'hozourban' });
const auth = asyncRoute(async (req,res,next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /i,'');
  if (!token) return res.status(401).json({ error:'احراز هویت لازم است.' });
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET, { issuer:'hozourban' });
    const { rows } = await pool.query('SELECT id, organization_id, branch_id, employee_code, full_name, role, active FROM users WHERE id=$1', [p.sub]);
    if (!rows[0]?.active) return res.status(401).json({ error:'حساب غیرفعال است.' });
    req.user = rows[0]; next();
  } catch { return res.status(401).json({ error:'نشست نامعتبر یا منقضی شده است.' }); }
});
const allow = (...roles) => (req,res,next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error:'دسترسی کافی ندارید.' });
const audit = (u, action, type, id, req, details={}) => pool.query(
  'INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,ip,user_agent,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
  [u.organization_id,u.id,action,type,id,req.ip,req.get('user-agent'),details]
);

app.get('/api/health', asyncRoute(async (_req,res) => { await pool.query('SELECT 1'); res.json({ status:'ok', service:'hozourban-api' }); }));
app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const body = z.object({ organizationId:z.string().uuid(), employeeCode:z.string().min(1).max(40), password:z.string().min(1).max(128) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error:'اطلاعات ورود معتبر نیست.' });
  const { organizationId, employeeCode, password } = body.data;
  const { rows } = await pool.query('SELECT * FROM users WHERE organization_id=$1 AND employee_code=$2 AND active=true', [organizationId,employeeCode]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({ error:'کد پرسنلی یا رمز اشتباه است.' });
  res.json({ token:sign(user), user:{ id:user.id, employeeCode:user.employee_code, name:user.full_name, role:user.role, branchId:user.branch_id } });
}));
app.get('/api/me', auth, (req,res) => res.json({ user:req.user }));
app.get('/api/employees', auth, allow('owner','admin','hr'), asyncRoute(async (req,res) => {
  const { rows } = await pool.query('SELECT id,employee_code,full_name,job_title,role,active,branch_id FROM users WHERE organization_id=$1 ORDER BY full_name', [req.user.organization_id]);
  res.json({ employees:rows });
}));
app.post('/api/employees', auth, allow('owner','admin','hr'), asyncRoute(async (req,res) => {
  const parsed = z.object({ employeeCode:z.string().min(1).max(40), name:z.string().min(2).max(120), jobTitle:z.string().max(120).optional(), password:z.string().min(10).max(128), branchId:z.string().uuid(), role:z.enum(['hr','employee','kiosk']).default('employee') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'اطلاعات کارمند معتبر نیست.' });
  const d=parsed.data, hash=await bcrypt.hash(d.password,12);
  const { rows }=await pool.query('INSERT INTO users(organization_id,branch_id,employee_code,full_name,job_title,password_hash,role) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,employee_code,full_name,job_title,role,branch_id', [req.user.organization_id,d.branchId,d.employeeCode,d.name,d.jobTitle||null,hash,d.role]);
  await audit(req.user,'employee.created','user',rows[0].id,req);
  res.status(201).json({ employee:rows[0] });
}));
app.post('/api/attendance', auth, asyncRoute(async (req,res) => {
  const parsed=z.object({ employeeCode:z.string().min(1).max(40), kind:z.enum(['in','out','break_start','break_end']), deviceId:z.string().uuid().optional(), photoObjectKey:z.string().max(500).optional(), idempotencyKey:z.string().uuid().default(randomUUID()) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'اطلاعات تردد معتبر نیست.' });
  const d=parsed.data;
  const { rows:people }=await pool.query('SELECT id,branch_id FROM users WHERE organization_id=$1 AND employee_code=$2 AND active=true', [req.user.organization_id,d.employeeCode]);
  if (!people[0]) return res.status(404).json({ error:'کارمند پیدا نشد.' });
  const person=people[0];
  if (!['owner','admin','hr','kiosk'].includes(req.user.role) && req.user.id!==person.id) return res.status(403).json({ error:'اجازه ثبت تردد برای این کارمند را ندارید.' });
  const branchId=person.branch_id || req.user.branch_id;
  if (!branchId) return res.status(400).json({ error:'شعبه کارمند مشخص نشده است.' });
  const { rows }=await pool.query(
    'INSERT INTO attendance_events(organization_id,branch_id,user_id,device_id,kind,photo_object_key,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (organization_id,idempotency_key) DO NOTHING RETURNING id,kind,occurred_at,user_id',
    [req.user.organization_id,branchId,person.id,d.deviceId||null,d.kind,d.photoObjectKey||null,d.idempotencyKey]);
  if (!rows[0]) return res.status(409).json({ error:'این درخواست قبلاً ثبت شده است.' });
  await audit(req.user,'attendance.recorded','attendance_event',rows[0].id,req,{ kind:d.kind, employeeId:person.id });
  res.status(201).json({ event:rows[0] });
}));
app.get('/api/attendance', auth, allow('owner','admin','hr'), asyncRoute(async (req,res) => {
  const q=z.object({ from:z.string().date().optional(), to:z.string().date().optional(), employeeId:z.string().uuid().optional() }).safeParse(req.query);
  if (!q.success) return res.status(400).json({ error:'فیلتر تاریخ معتبر نیست.' });
  const {from,to,employeeId}=q.data;
  const {rows}=await pool.query(`SELECT a.id,a.kind,a.occurred_at,a.photo_object_key,u.employee_code,u.full_name FROM attendance_events a JOIN users u ON u.id=a.user_id WHERE a.organization_id=$1 AND ($2::date IS NULL OR a.occurred_at >= $2::date) AND ($3::date IS NULL OR a.occurred_at < ($3::date + interval '1 day')) AND ($4::uuid IS NULL OR a.user_id=$4) ORDER BY a.occurred_at DESC LIMIT 2000`,[req.user.organization_id,from||null,to||null,employeeId||null]);
  res.json({ events:rows });
}));
app.get('/api/leave', auth, asyncRoute(async (req,res) => {
  const sql=['owner','admin','hr'].includes(req.user.role)
    ? 'SELECT l.*,u.full_name,u.employee_code FROM leave_requests l JOIN users u ON u.id=l.user_id WHERE l.organization_id=$1 ORDER BY l.created_at DESC'
    : 'SELECT * FROM leave_requests WHERE organization_id=$1 AND user_id=$2 ORDER BY created_at DESC';
  const {rows}=await pool.query(sql,['owner','admin','hr'].includes(req.user.role)?[req.user.organization_id]:[req.user.organization_id,req.user.id]);
  res.json({ requests:rows });
}));
app.post('/api/leave', auth, asyncRoute(async (req,res) => {
  const d=z.object({ type:z.enum(['annual','sick','unpaid','mission']), startsAt:z.string().date(), endsAt:z.string().date(), reason:z.string().max(1000).optional() }).safeParse(req.body);
  if(!d.success) return res.status(400).json({error:'درخواست مرخصی معتبر نیست.'});
  const {rows}=await pool.query('INSERT INTO leave_requests(organization_id,user_id,leave_type,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.user.organization_id,req.user.id,d.data.type,d.data.startsAt,d.data.endsAt,d.data.reason||null]);
  await audit(req.user,'leave.created','leave_request',rows[0].id,req);
  res.status(201).json({request:rows[0]});
}));
app.patch('/api/leave/:id/review', auth, allow('owner','admin','hr'), asyncRoute(async (req,res) => {
  const d=z.object({status:z.enum(['approved','rejected'])}).safeParse(req.body);
  if(!d.success) return res.status(400).json({error:'وضعیت نامعتبر است.'});
  const {rows}=await pool.query("UPDATE leave_requests SET status=$1,reviewed_by=$2,reviewed_at=now() WHERE id=$3 AND organization_id=$4 AND status='pending' RETURNING *",[d.data.status,req.user.id,req.params.id,req.user.organization_id]);
  if(!rows[0]) return res.status(404).json({error:'درخواست در انتظار بررسی پیدا نشد.'});
  await audit(req.user,'leave.reviewed','leave_request',rows[0].id,req,{status:d.data.status});
  res.json({request:rows[0]});
}));
app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({error:'خطای داخلی سرور.'}); });
const port=Number(process.env.PORT||4000);
app.listen(port,()=>console.log(`HozourBan API listening on ${port}`));
