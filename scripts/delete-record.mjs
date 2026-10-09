/**
 * 删除指定登记记录（同时会删掉对象存储里的收款码）。
 *
 * 用法：
 *   node scripts/delete-record.mjs 22 23 24        # 按编号删除
 *   node scripts/delete-record.mjs --list          # 只列出当前所有记录
 *   node scripts/delete-record.mjs --test          # 删除自测产生的 LD26SMOKE 记录
 *   node scripts/delete-record.mjs --visual        # 删除视觉检查产生的 LD2610VISUAL 记录
 *
 * 环境变量：ADMIN_PASSWORD（必须）、BASE（默认线上地址）
 */
const BASE = process.env.BASE || process.env.CLEAN_BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const jar = new Map();
const save = (r) => {
  for (const c of r.headers.getSetCookie()) {
    const p = c.split(';')[0];
    const i = p.indexOf('=');
    jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
};
const ck = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

save(
  await fetch(`${BASE}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD })
  })
);

const list = await (await fetch(`${BASE}/api/admin/refunds?status=all&pageSize=100`, { headers: { cookie: ck() } })).json();
if (!list.ok) {
  console.error('登录或读取失败：', JSON.stringify(list));
  process.exit(1);
}

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--list')) {
  console.log(`共 ${list.data.rows.length} 条记录（${BASE}）：`);
  for (const r of list.data.rows) {
    console.log(`  #${r.id}  ${r.order_no}  ¥${r.amount}  ${r.status}  ${r.created_at}  收款码:${r.has_receipt ? '有' : '无'}`);
  }
  if (args.length === 0) {
    console.log('\n加编号即可删除，例如：node scripts/delete-record.mjs 22');
  }
  process.exit(0);
}

const targets = args.includes('--test')
  ? list.data.rows.filter((r) => r.order_no.startsWith('LD26SMOKE')).map((r) => r.id)
  : args.includes('--visual')
    ? list.data.rows.filter((r) => r.order_no.startsWith('LD2610VISUAL')).map((r) => r.id)
    : args.filter((a) => /^\d+$/.test(a)).map(Number);

if (targets.length === 0) {
  console.log('没有匹配到要删除的记录。');
  process.exit(0);
}

for (const id of targets) {
  const row = list.data.rows.find((r) => r.id === id);
  const res = await fetch(`${BASE}/api/admin/refunds?id=${id}`, { method: 'DELETE', headers: { cookie: ck() } });
  const out = await res.json().catch(() => ({}));
  console.log(`删除 #${id}${row ? ` (${row.order_no})` : ''} -> ${res.status}${out.ok ? ' ✅' : ' ❌'}`);
}

const after = await (await fetch(`${BASE}/api/admin/refunds?status=all`, { headers: { cookie: ck() } })).json();
console.log(`\n剩余记录：${after.data.stats.all} 条（待退款 ${after.data.stats.pending} / 已退款 ${after.data.stats.refunded} / 已驳回 ${after.data.stats.rejected}）`);
