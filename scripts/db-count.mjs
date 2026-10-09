/**
 * 直接查云数据库，核对记录数（绕过应用层，排除接口/缓存的干扰）。
 * 用法：node scripts/db-count.mjs
 */
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const get = (k) => {
  const m = new RegExp(`^${k}=(.*)$`, 'm').exec(env);
  return m ? m[1].replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim() : '';
};
const url = get('DATABASE_URL');
if (!url) throw new Error('.env.local 缺少 DATABASE_URL');

const { neon } = await import('@neondatabase/serverless');
const sql = neon(url);

const total = await sql('SELECT count(*)::int AS c FROM refunds');
console.log('总记录数:', total[0].c);

const byStatus = await sql('SELECT status, count(*)::int AS c FROM refunds GROUP BY status ORDER BY status');
console.log('按状态:', JSON.stringify(byStatus));

const rows = await sql(
  'SELECT id, order_no, amount, status, left(contact, 12) AS contact, created_at FROM refunds ORDER BY id DESC LIMIT 20'
);
console.log('明细:');
for (const r of rows) {
  console.log(`  #${r.id} ${r.order_no} ¥${r.amount} ${r.status} ${r.contact} ${r.created_at}`);
}

const blobs = await sql("SELECT count(*)::int AS c FROM refunds WHERE receipt_url <> ''");
console.log('使用对象存储的收款码:', blobs[0].c);
