/**
 * 造几条视觉检查用的假数据（只在本机/线上临时用，检查完请用
 * `node scripts/delete-record.mjs --test` 或页面上的删除按钮清掉）。
 *
 * 用法：node scripts/seed-visual-data.mjs [base]
 * 收款码图：优先用 tmp-fake-qr.png（更接近真实截图），没有则退回 1x1 占位。
 */
import { existsSync, readFileSync } from 'fs';

const BASE = process.argv[2] || process.env.CHECK_BASE || 'http://127.0.0.1:3000';

const QR_PATH = 'tmp-fake-qr.png';
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAI/wH+pNNPAAAAAElFTkSuQmCC';

const receipt =
  existsSync(QR_PATH) && readFileSync(QR_PATH).length > 1000
    ? `data:image/png;base64,${readFileSync(QR_PATH).toString('base64')}`
    : `data:image/png;base64,${PNG_1PX}`;
console.log(`使用收款码图：${receipt.length > 1000 ? QR_PATH : '1x1 占位图'}`);

const ITEMS = [
  {
    order_no: 'LD2610VISUAL01',
    redeem_code: '9H6R-APN8-7URB',
    amount: '96',
    reason_code: 'student_auth_failed',
    redeem_state: 'not_passed',
    contact_type: 'wechat',
    contact: 'wx_visual_0001',
    contact_name: '张三',
    description: '兑换时提示「无法正常获取学生认证」，重试多次仍失败。'
  },
  {
    order_no: 'LD2610VISUAL02',
    redeem_code: '8342-GSER-VJZT',
    amount: '133.9',
    reason_code: 'other',
    redeem_state: 'disabled',
    contact_type: 'qq',
    contact: 'qq_visual_0002',
    contact_name: '李四',
    description: '买错商品了，想退款重新下单。'
  },
  {
    order_no: 'LD2610VISUAL03',
    redeem_code: 'A85S-7QRM-5ZN2',
    amount: '96',
    reason_code: 'code_already_used',
    redeem_state: 'used',
    contact_type: 'phone',
    contact: '13900000003',
    contact_name: '',
    description: ''
  }
];

for (const item of ITEMS) {
  const res = await fetch(`${BASE}/api/refunds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...item, receipt })
  });
  const json = await res.json().catch(() => null);
  const ok = res.ok && json?.ok;
  console.log(`${ok ? '✅' : '❌'} ${item.order_no} -> ${res.status}${ok ? '' : ` ${JSON.stringify(json?.errors || json)}`}`);
}
