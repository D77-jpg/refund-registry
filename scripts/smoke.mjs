/**
 * 端到端自测脚本：直接打真实 HTTP 接口，验证
 *   1) 提交登记成功
 *   2) 重复订单号被拦截
 *   3) 用户凭订单号 + 联系方式后 4 位查询进度
 *   4) 未登录访问后台被拒
 *   5) 登录后台、列表可见、标记已退款、导出 CSV
 *
 * 用法：先 npm run build && npm start，然后 node scripts/smoke.mjs
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.SMOKE_PASSWORD || process.env.ADMIN_PASSWORD || 'admin123';

// 1x1 白色 PNG
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAI/wH+pNNPAAAAAElFTkSuQmCC';

let pass = 0;
let fail = 0;
const cookieJar = new Map();

function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

function saveCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function post(path, body, useCookies = false) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(useCookies && cookieHeader() ? { cookie: cookieHeader() } : {})
    },
    body: JSON.stringify(body)
  });
  saveCookies(res);
  return { res, json: await res.json().catch(() => null) };
}

const orderNo = `LD26SMOKE${Date.now().toString().slice(-6)}`;
const payload = {
  order_no: orderNo,
  redeem_code: '9H6R-APN8-7URB',
  contact_type: 'wechat',
  contact: 'smoketest_wx_8899',
  contact_name: '自测用户',
  amount: '96',
  reason_code: 'student_auth_failed',
  redeem_state: 'not_passed',
  description: '接口自测：无法正常获取学生认证',
  receipt: `data:image/png;base64,${PNG_1PX}`
};

console.log(`\n▶ 目标 ${BASE}\n`);

// 0. 健康检查
{
  const res = await fetch(`${BASE}/api/health`);
  const json = await res.json();
  check('健康检查可访问', res.ok, JSON.stringify(json));
  console.log(`     存储模式：${json?.data?.mode}（${json?.data?.detail}）`);
}

// 1. 提交登记
{
  const { res, json } = await post('/api/refunds', payload);
  check('提交登记成功', res.ok && json?.ok === true, JSON.stringify(json));
}

// 2. 重复订单号
{
  const { res, json } = await post('/api/refunds', payload);
  check('重复订单号被拦截(409)', res.status === 409 && json?.code === 'DUPLICATE_ORDER', JSON.stringify(json));
}

// 3. 参数校验
{
  const { res, json } = await post('/api/refunds', { ...payload, order_no: 'XX123', contact: '' });
  check('非法参数被拒绝(400)', res.status === 400 && json?.ok === false, JSON.stringify(json));
}

// 4. 用户查询进度
{
  const { res, json } = await post('/api/refunds/lookup', { order_no: orderNo, contact_tail: '8899' });
  check('用户查询到自己的记录', res.ok && json?.data?.order_no === orderNo, JSON.stringify(json));
  check('查询结果脱敏（兑换码打码）', /^\w{4}-\*{4}-\*{4}$/.test(json?.data?.redeem_code || ''), json?.data?.redeem_code);
}

// 5. 查询时联系方式不匹配
{
  const { res } = await post('/api/refunds/lookup', { order_no: orderNo, contact_tail: '0000' });
  check('联系方式不匹配被拒(403)', res.status === 403, `status=${res.status}`);
}

// 6. 未登录访问后台
{
  const res = await fetch(`${BASE}/api/admin/refunds`);
  check('未登录访问后台被拒(401)', res.status === 401, `status=${res.status}`);
}

// 7. 错误密码
{
  const { res } = await post('/api/admin/session', { password: 'wrong-password' });
  check('错误密码登录被拒(401)', res.status === 401, `status=${res.status}`);
}

// 8. 正确密码登录
{
  const { res, json } = await post('/api/admin/session', { password: PASSWORD });
  check('正确密码登录成功', res.ok && json?.ok === true, JSON.stringify(json));
  check('登录后拿到会话 Cookie', cookieHeader().includes('rr_admin='), cookieHeader());
}

// 9. 后台列表
let targetId = null;
{
  const res = await fetch(`${BASE}/api/admin/refunds?status=pending&q=${orderNo}`, {
    headers: { cookie: cookieHeader() }
  });
  const json = await res.json();
  const row = json?.data?.rows?.find((r) => r.order_no === orderNo);
  targetId = row?.id ?? null;
  check('后台列表能查到新登记', Boolean(row), JSON.stringify(json).slice(0, 200));
  check('列表返回 has_receipt 标记', row?.has_receipt === true, String(row?.has_receipt));
  check('列表不返回 base64 图片本体', row && row.receipt_data === undefined);
}

// 10. 查看收款码
if (targetId) {
  const res = await fetch(`${BASE}/api/admin/receipts/${targetId}`, { headers: { cookie: cookieHeader() } });
  const buf = new Uint8Array(await res.arrayBuffer());
  check('可拉取收款码图片', res.ok && buf.length > 0, `bytes=${buf.length}`);
}

// 11. 标记已退款
if (targetId) {
  const res = await fetch(`${BASE}/api/admin/refunds`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: cookieHeader() },
    body: JSON.stringify({ id: targetId, status: 'refunded', admin_note: '自测：已打款', refund_ref: 'SMOKE-001' })
  });
  const json = await res.json();
  check('标记已退款成功', res.ok && json?.data?.status === 'refunded', JSON.stringify(json).slice(0, 200));
}

// 12. 用户端看到最新状态
{
  const { json } = await post('/api/refunds/lookup', { order_no: orderNo, contact_tail: '8899' });
  check('用户端状态同步为已退款', json?.data?.status === 'refunded', JSON.stringify(json?.data));
  check('用户端可见处理备注', json?.data?.admin_note === '自测：已打款', json?.data?.admin_note);
}

// 13. 导出 CSV
{
  const res = await fetch(`${BASE}/api/admin/refunds?status=all&q=${orderNo}&export=csv`, {
    headers: { cookie: cookieHeader() }
  });
  // 注意：Node 的 fetch 读 text() 时会自动剥掉 BOM，所以改用原始字节校验
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');
  check('CSV 导出成功', res.ok && text.includes(orderNo), `len=${text.length}`);
  check(
    'CSV 以 UTF-8 BOM 开头（Excel 打开不乱码）',
    buf.subarray(0, 3).toString('hex') === 'efbbbf',
    buf.subarray(0, 3).toString('hex')
  );
  check('CSV 含中文表头', text.includes('订单号') && text.includes('兑换码'));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
