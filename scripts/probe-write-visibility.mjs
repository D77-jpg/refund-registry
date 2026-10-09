/**
 * 决定性实验：通过线上接口提交一条记录，然后立刻在本地直查数据库，
 * 判断「线上写入的库」与「本地查的库」到底是不是同一个。
 *
 * 用法：node scripts/probe-write-visibility.mjs [base]
 * 结束后会自动尝试删除刚写入的记录。
 */
import { readFileSync } from 'fs';

const BASE = process.argv[2] || 'https://refund-registry.vercel.app';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ORDER = `LD26PROBE${String(Date.now()).slice(-6)}`;

const env = readFileSync('.env.local', 'utf8');
const dbUrl = /^DATABASE_URL=(.*)$/m.exec(env)[1].replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();
const { neon } = await import('@neondatabase/serverless');
const sql = neon(dbUrl);

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAI/wH+pNNPAAAAAElFTkSuQmCC';

console.log(`提交订单号：${ORDER}`);

// 1) 线上写入
const submit = await fetch(`${BASE}/api/refunds`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    order_no: ORDER,
    redeem_code: '9H6R-APN8-7URB',
    contact_type: 'wechat',
    contact: 'probe_wx_0001',
    amount: '96',
    reason_code: 'student_auth_failed',
    redeem_state: 'not_passed',
    description: '库一致性排查用的临时记录',
    receipt: `data:image/png;base64,${PNG}`
  })
});
const submitJson = await submit.json().catch(() => null);
console.log('线上提交结果：', submit.status, JSON.stringify(submitJson));

// 2) 线上自述的计数
const diag = await (await fetch(`${BASE}/api/diag`)).json().catch(() => null);
console.log('线上自述 count：', diag?.data?.count, '| sample 行数：', diag?.data?.sample?.length);

// 3) 本地直查
const local = await sql('SELECT count(*)::int AS c FROM refunds');
const found = await sql('SELECT id, order_no, status, created_at FROM refunds WHERE order_no = $1', [ORDER]);
console.log('本地直查 count：', local[0].c);
console.log('本地能否看到刚提交的记录：', found.length > 0 ? `是（#${found[0].id} ${found[0].status}）` : '否 ❗');

// 4) 清理
if (found.length > 0) {
  const jar = new Map();
  const save = (r) => {
    for (const c of r.headers.getSetCookie()) {
      const p = c.split(';')[0];
      const i = p.indexOf('=');
      jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
    }
  };
  save(
    await fetch(`${BASE}/api/admin/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD })
    })
  );
  const del = await fetch(`${BASE}/api/admin/refunds?id=${found[0].id}`, {
    method: 'DELETE',
    headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }
  });
  console.log('清理临时记录：', del.status);
}
