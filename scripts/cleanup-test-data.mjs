/** 清理自测数据：删除订单号以 LD26SMOKE 开头的记录 */
const BASE = process.env.CLEAN_BASE || 'http://127.0.0.1:3000';
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

const listRes = await fetch(`${BASE}/api/admin/refunds?status=all&pageSize=100`, {
  headers: { cookie: ck() }
});
const list = await listRes.json();
if (!list.ok) {
  console.error('列表读取失败', JSON.stringify(list));
  process.exit(1);
}

const targets = list.data.rows.filter((r) => r.order_no.startsWith('LD26SMOKE'));
for (const r of targets) {
  const res = await fetch(`${BASE}/api/admin/refunds?id=${r.id}`, {
    method: 'DELETE',
    headers: { cookie: ck() }
  });
  console.log(`删除 #${r.id} ${r.order_no} -> ${res.status}`);
}

const after = await (await fetch(`${BASE}/api/admin/refunds?status=all`, { headers: { cookie: ck() } })).json();
console.log(`剩余记录：${after.data.stats.all} 条（待退款 ${after.data.stats.pending}）`);
