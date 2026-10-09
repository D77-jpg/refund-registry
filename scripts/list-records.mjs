/**
 * 查看后台记录（按状态分组，确实取全部）。
 * 用法：node scripts/list-records.mjs [base]
 */
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:3000';
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

const login = await fetch(`${BASE}/api/admin/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD })
});
save(login);
if (!login.ok) {
  console.error('登录失败', login.status);
  process.exit(1);
}

const res = await fetch(`${BASE}/api/admin/refunds?status=all&pageSize=100`, { headers: { cookie: ck() } });
const data = await res.json();
if (!data.ok) {
  console.error('读取失败', JSON.stringify(data));
  process.exit(1);
}

console.log(`${BASE} 共 ${data.data.total} 条（统计：${JSON.stringify(data.data.stats)}）`);
for (const r of data.data.rows) {
  console.log(
    `  #${r.id}  ${r.order_no.padEnd(18)} ¥${String(r.amount).padEnd(7)} ${r.status.padEnd(9)} ${r.created_at}  收款码:${r.has_receipt ? '有' : '无'}`
  );
}
