/**
 * 对比「线上生产环境变量里的 DATABASE_URL」和「本地 .env.local 的 DATABASE_URL」，
 * 并分别查一次记录数，确认线上到底把数据写到哪个库。
 *
 * 用法：先 `vercel env pull .env.prodcheck --environment=production`，再运行本脚本。
 */
import { readFileSync } from 'fs';

const envLocal = readFileSync('.env.local', 'utf8');
const envProd = readFileSync('.env.prodcheck', 'utf8');

const pick = (raw, key) => {
  const m = new RegExp(`^${key}=(.*)$`, 'm').exec(raw);
  if (!m) return '';
  return m[1].replace(/^\uFEFF/, '').replace(/^"|"$/g, '').replace(/[\r\n\t]/g, '').trim();
};

const localUrl = pick(envLocal, 'DATABASE_URL');
const prodUrl = pick(envProd, 'DATABASE_URL');

const hostOf = (u) => {
  if (!u || u === '[SENSITIVE]') return `(未取到实际值: ${u || '空'})`;
  try {
    const p = new URL(u);
    return `${p.host}${p.pathname}`;
  } catch {
    return `无法解析: ${u.slice(0, 50)}`;
  }
};

console.log('本地 DATABASE_URL :', hostOf(localUrl));
console.log('线上 DATABASE_URL :', hostOf(prodUrl));

const usable = (u) => u && u !== '[SENSITIVE]' && u.startsWith('postgres');
console.log('两者是否同一库    :', usable(prodUrl) && prodUrl === localUrl ? '是' : usable(prodUrl) ? '否 ❗' : '无法判断（线上值未拉取到）');

const { neon } = await import('@neondatabase/serverless');

for (const [label, url] of [
  ['本地库', localUrl],
  ['线上库', prodUrl]
]) {
  if (!usable(url)) {
    console.log(`${label}: 跳过（无可用连接串）`);
    continue;
  }
  try {
    const sql = neon(url);
    const rows = await sql('SELECT count(*)::int AS c FROM refunds');
    const list = await sql('SELECT id, order_no, status, created_at FROM refunds ORDER BY id DESC LIMIT 10');
    console.log(`${label} 记录数:`, rows[0].c);
    for (const r of list) console.log(`   #${r.id} ${r.order_no} ${r.status} ${r.created_at}`);
  } catch (err) {
    console.log(`${label} 查询失败:`, err?.message || err);
  }
}
