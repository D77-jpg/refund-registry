/**
 * 复现排查：对同一个云数据库，用「Neon HTTP 直连」和「应用数据层（先建表再查）」
 * 两条路径各查多次，看计数是否稳定、是否出现「一次请求内两个数字不一致」。
 *
 * 用法：node scripts/repro-count.mjs
 */
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = /^DATABASE_URL=(.*)$/m.exec(env)[1].replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();

const { neon } = await import('@neondatabase/serverless');

// 路径 A：裸 neon 直连
const sqlA = neon(url);
console.log('--- 路径 A：直接 neon() ---');
for (let i = 0; i < 5; i++) {
  const r = await sqlA('SELECT count(*)::int AS c FROM refunds');
  console.log(`  A${i}: count=${r[0].c} 原始=${JSON.stringify(r)}`);
}

// 路径 B：应用数据层（会先跑建表/迁移语句，再查）
console.log('--- 路径 B：应用数据层 healthCheck ---');
const db = await import('../lib/db.ts').catch(() => null);
if (!db) {
  console.log('  (Node 无法直接 import TS，改用 tsx 或走接口验证)');
} else {
  for (let i = 0; i < 5; i++) {
    const h = await db.healthCheck();
    console.log(`  B${i}: ${h.detail}`);
  }
}

// 路径 C：模拟数据层做的事——先执行同样的 DDL，再查计数
console.log('--- 路径 C：先执行建表/迁移语句，再查计数 ---');
const sqlC = neon(url);
const DDL = [
  `CREATE TABLE IF NOT EXISTS refunds (
     id SERIAL PRIMARY KEY, order_no TEXT NOT NULL UNIQUE, redeem_code TEXT NOT NULL DEFAULT '',
     contact TEXT NOT NULL DEFAULT '', contact_type TEXT NOT NULL DEFAULT '', contact_name TEXT NOT NULL DEFAULT '',
     amount NUMERIC(12,2) NOT NULL DEFAULT 0, reason_code TEXT NOT NULL DEFAULT '', redeem_state TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '', receipt_mime TEXT NOT NULL DEFAULT '', receipt_data TEXT NOT NULL DEFAULT '',
     receipt_url TEXT NOT NULL DEFAULT '', receipt_pathname TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
     admin_note TEXT NOT NULL DEFAULT '', refund_ref TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '',
     user_agent TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), refunded_at TIMESTAMPTZ)`,
  `CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds (status)`,
  `CREATE INDEX IF NOT EXISTS refunds_created_idx ON refunds (created_at DESC)`,
  `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS receipt_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS receipt_pathname TEXT NOT NULL DEFAULT ''`
];
for (const stmt of DDL) {
  const res = await sqlC(stmt, []);
  if (process.env.VERBOSE) console.log('   DDL 返回:', JSON.stringify(res));
}
for (let i = 0; i < 5; i++) {
  const r = await sqlC('SELECT count(*)::int AS c FROM refunds');
  console.log(`  C${i}: count=${r[0].c}`);
}

// 路径 D：查一下当前库/模式/表，确认不是连到了别的 schema
console.log('--- 路径 D：环境自述 ---');
const info = await sqlA(
  `SELECT current_database() AS db, current_schema() AS schema,
          (SELECT count(*)::int FROM information_schema.tables WHERE table_name = 'refunds') AS tables_named_refunds,
          pg_backend_pid() AS pid`
);
console.log(' ', JSON.stringify(info[0]));
