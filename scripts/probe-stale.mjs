/**
 * 连续探测线上两个端点，判断陈旧读是「持续存在」还是「偶发」。
 * 用法：node scripts/probe-stale.mjs [base] [次数]
 */
const BASE = process.argv[2] || 'https://refund-registry.vercel.app';
const times = Number(process.argv[3] || 5);
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

for (let i = 0; i < times; i++) {
  const h = await (await fetch(`${BASE}/api/health`, { cache: 'no-store' })).json();
  const d = await (await fetch(`${BASE}/api/diag`, { cache: 'no-store' })).json();
  const l = await (
    await fetch(`${BASE}/api/admin/refunds?status=all&pageSize=10`, { headers: { cookie: ck() }, cache: 'no-store' })
  ).json();

  const healthCount = /当前 (\d+) 条/.exec(h?.data?.detail || '')?.[1];
  console.log(
    `${i} health=${healthCount} | http=${d?.data?.httpProbe?.count} tcp=${d?.data?.tcpProbe?.count} | 后台列表 total=${l?.data?.total}`
  );
  await new Promise((s) => setTimeout(s, 1500));
}
