/**
 * 数据一致性回归测试：专门盯住「写入后读不到 / 读到旧值」这类缓存导致的陈旧读。
 *
 * 背景：线上曾出现 /api/health 长期显示旧的记录数（HTTP 驱动读到缓存），
 * 而真实数据里已经没有这些行。对退款核对来说这会导致重复打款，必须回归覆盖。
 *
 * 覆盖点：
 *   1) /api/health 自述的条数 == /api/diag 里 HTTP 驱动与 TCP 驱动查到的条数
 *   2) 新提交一条登记后，健康接口的条数立刻 +1（写入可见）
 *   3) 后台列表立刻能看到这条新记录
 *   4) 标记已退款后，健康接口与用户查询接口都立刻反映最新状态
 *   5) 删除后条数回落
 *
 * 用法：node scripts/check-consistency.mjs [base]
 */
const BASE = process.argv[2] || process.env.CHECK_BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
};

const jar = new Map();
const save = (r) => {
  for (const c of r.headers.getSetCookie()) {
    const p = c.split(';')[0];
    const i = p.indexOf('=');
    jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
};
const ck = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAI/wH+pNNPAAAAAElFTkSuQmCC';
const ORDER = `LD26CONSIST${String(Date.now()).slice(-6)}`;

const healthCount = async () => {
  const r = await (await fetch(`${BASE}/api/health`, { cache: 'no-store' })).json();
  return Number(/当前 (\d+) 条/.exec(r?.data?.detail || '')?.[1] ?? NaN);
};
const diag = async () => (await (await fetch(`${BASE}/api/diag`, { cache: 'no-store' })).json())?.data;

console.log(`\n▶ 目标 ${BASE}\n`);

// ---- 1. 两条驱动与健康接口口径一致 ----
{
  const d = await diag();
  const h = await healthCount();
  check('健康接口条数与 HTTP 驱动一致', h === d?.httpProbe?.count, `health=${h} http=${d?.httpProbe?.count}`);
  check('HTTP 驱动与 TCP 驱动结果一致（无陈旧读）', d?.httpProbe?.count === d?.tcpProbe?.count, `http=${d?.httpProbe?.count} tcp=${d?.tcpProbe?.count}`);
  check('数据层选用的驱动已上报', Boolean(d?.driver), String(d?.driver));
}

// ---- 2. 写入后立刻可见 ----
const before = await healthCount();
{
  const res = await fetch(`${BASE}/api/refunds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      order_no: ORDER,
      redeem_code: '9H6R-APN8-7URB',
      contact_type: 'wechat',
      contact: 'consistency_wx_0001',
      amount: '96',
      reason_code: 'student_auth_failed',
      redeem_state: 'not_passed',
      description: '一致性回归测试记录',
      receipt: `data:image/png;base64,${PNG}`
    })
  });
  const j = await res.json().catch(() => null);
  check('提交测试记录成功', res.ok && j?.ok === true, JSON.stringify(j).slice(0, 160));

  const after = await healthCount();
  check('健康接口条数立刻 +1（写入可见）', after === before + 1, `${before} -> ${after}`);
}

// ---- 3. 后台列表立刻可见 ----
save(
  await fetch(`${BASE}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD })
  })
);

let recordId = null;
{
  const res = await fetch(`${BASE}/api/admin/refunds?status=all&q=${ORDER}`, {
    headers: { cookie: ck() },
    cache: 'no-store'
  });
  const j = await res.json();
  const row = j?.data?.rows?.find((r) => r.order_no === ORDER);
  recordId = row?.id ?? null;
  check('后台列表立刻能看到新记录', Boolean(row), JSON.stringify(j).slice(0, 160));
  const d = await diag();
  check('新记录后三条口径仍一致', d?.httpProbe?.count === d?.tcpProbe?.count && (await healthCount()) === d?.httpProbe?.count);
}

// ---- 4. 状态变更立刻反映 ----
if (recordId) {
  await fetch(`${BASE}/api/admin/refunds`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: ck() },
    body: JSON.stringify({ id: recordId, status: 'refunded', admin_note: '一致性测试' })
  });

  const list = await (
    await fetch(`${BASE}/api/admin/refunds?status=all&q=${ORDER}`, { headers: { cookie: ck() }, cache: 'no-store' })
  ).json();
  const row = list?.data?.rows?.find((r) => r.order_no === ORDER);
  check('后台列表立刻反映已退款状态', row?.status === 'refunded', String(row?.status));

  const lookup = await (
    await fetch(`${BASE}/api/refunds/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_no: ORDER, contact_tail: '0001' })
    })
  ).json();
  check('用户查询接口立刻反映已退款状态', lookup?.data?.status === 'refunded', JSON.stringify(lookup?.data).slice(0, 160));

  // ---- 5. 删除后条数回落 ----
  const del = await fetch(`${BASE}/api/admin/refunds?id=${recordId}`, {
    method: 'DELETE',
    headers: { cookie: ck() }
  });
  check('删除测试记录成功', del.ok);

  const finalCount = await healthCount();
  check('删除后健康接口条数回落', finalCount === before, `期望 ${before}，实际 ${finalCount}`);
  const d = await diag();
  check('删除后 HTTP 与 TCP 仍一致', d?.httpProbe?.count === d?.tcpProbe?.count, `http=${d?.httpProbe?.count} tcp=${d?.tcpProbe?.count}`);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
