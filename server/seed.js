import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { z } from 'zod';

const env=z.object({DATABASE_URL:z.string().url(),BOOTSTRAP_ORG_NAME:z.string().min(2),BOOTSTRAP_BRANCH_NAME:z.string().min(2),BOOTSTRAP_ADMIN_CODE:z.string().min(1),BOOTSTRAP_ADMIN_NAME:z.string().min(2),BOOTSTRAP_ADMIN_PASSWORD:z.string().min(14)}).parse(process.env);
const pool=new Pool({connectionString:env.DATABASE_URL,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true}:undefined});
try {
  await pool.query('BEGIN');
  const org=(await pool.query('INSERT INTO organizations(name) VALUES($1) RETURNING id',[env.BOOTSTRAP_ORG_NAME])).rows[0];
  const branch=(await pool.query('INSERT INTO branches(organization_id,name) VALUES($1,$2) RETURNING id',[org.id,env.BOOTSTRAP_BRANCH_NAME])).rows[0];
  const hash=await bcrypt.hash(env.BOOTSTRAP_ADMIN_PASSWORD,12);
  await pool.query("INSERT INTO users(organization_id,branch_id,employee_code,full_name,password_hash,role) VALUES($1,$2,$3,$4,$5,'owner')",[org.id,branch.id,env.BOOTSTRAP_ADMIN_CODE,env.BOOTSTRAP_ADMIN_NAME,hash]);
  await pool.query('COMMIT');
  console.log('Organization, branch and owner account created. Organization ID:',org.id);
} catch(e) { await pool.query('ROLLBACK'); throw e; }
finally { await pool.end(); }
