import type { RefundInput } from './types';

/** 最大截图体积（base64 前的原始字节），前端压缩后一般 150KB~600KB */
export const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;

const ORDER_RE = /^LD[0-9A-Z]{8,24}$/;
const CODE_RE = /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;

export function normalizeOrderNo(raw: string): string {
  return String(raw || '')
    .replace(/[\s\u3000]/g, '')
    .toUpperCase();
}

/** 兑换码：去掉空格/换行，统一大写；兼容用户输入 9H6RAPN87URB（无横杠） */
export function normalizeRedeemCode(raw: string): string {
  const compact = String(raw || '')
    .replace(/[\s\u3000]/g, '')
    .toUpperCase();
  const noDash = compact.replace(/-/g, '');
  if (/^[0-9A-Z]{12}$/.test(noDash)) {
    return `${noDash.slice(0, 4)}-${noDash.slice(4, 8)}-${noDash.slice(8, 12)}`;
  }
  return compact;
}

export function normalizeContact(raw: string): string {
  return String(raw || '')
    .replace(/[\s\u3000]/g, '')
    .trim();
}

/** 金额校验：允许 96、133.9、96.00；范围 0.01 ~ 100000 */
export function parseAmount(raw: string): number | null {
  const v = String(raw || '').replace(/[^\d.]/g, '');
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0.01 || n > 100000) return null;
  return Math.round(n * 100) / 100;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** 归一化后的数据，ok 为 true 时可用 */
  value: RefundInput;
  /** 收款码的 base64（走对象存储时为空，由调用方填写 receipt_url） */
  receiptBase64: string;
  receiptMime: string;
}

/** 收款码来源：对象存储地址 或 内联 base64（二选一） */
export interface ParsedReceipt {
  mode: 'blob' | 'base64';
  url: string;
  pathname: string;
  mime: string;
  data: string;
}

const BLOB_HOST_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

/** 校验前端传来的对象存储地址，只接受本站 Blob 存储域名下的 https 地址 */
export function parseReceiptUrl(raw: unknown): { url: string; pathname: string } | null {
  const url = String(raw || '').trim();
  if (!url || url.length > 500) return null;
  if (!BLOB_HOST_RE.test(url)) return null;
  let pathname = '';
  try {
    pathname = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return null;
  }
  if (!/^receipts\/[a-f0-9]{32}-\d+\.(jpg|png|webp)$/.test(pathname)) return null;
  return { url, pathname };
}

/**
 * 校验收款码（base64 内联形式）。对象存储形式由 parseReceiptUrl 处理。
 */
export function parseReceipt(raw: unknown): { ok: true; value: ParsedReceipt } | { ok: false; error: string } {
  const receipt = String(raw || '');
  if (!receipt) return { ok: false, error: '请上传收款码截图（微信或支付宝）' };
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(receipt);
  if (!m) return { ok: false, error: '收款码图片格式不支持，请上传 png / jpg / webp 图片' };

  const mime = m[1] === 'image/jpg' ? 'image/jpeg' : m[1];
  const data = m[2].replace(/\s/g, '');
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      error: '收款码图片过大，请压缩到 3MB 以内（本页会自动压缩，若仍失败请换一张更小的截图）'
    };
  }
  // 只挡明显异常的空/损坏图片；真实收款码截图压缩后通常 150KB 以上
  if (bytes < 60) return { ok: false, error: '收款码图片内容异常，请重新上传' };

  return { ok: true, value: { mode: 'base64', url: '', pathname: '', mime, data } };
}

/**
 * 服务端权威校验。前端也会做一遍，但后端绝不能信任前端。
 * 收款码单独用 parseReceipt / parseReceiptUrl 校验，便于两种存储模式复用。
 */
export function validateRefundInput(body: any): ValidationResult {
  const errors: string[] = [];

  const order_no = normalizeOrderNo(body?.order_no);
  const redeem_code = normalizeRedeemCode(body?.redeem_code);
  const contact = normalizeContact(body?.contact);
  const contact_type = String(body?.contact_type || 'wechat').slice(0, 16);
  const contact_name = String(body?.contact_name || '').trim().slice(0, 64);
  const amountRaw = String(body?.amount ?? '');
  const reason_code = String(body?.reason_code || '').slice(0, 32);
  const redeem_state = String(body?.redeem_state || '').slice(0, 32);
  const description = String(body?.description || '').trim().slice(0, 500);
  const receipt = String(body?.receipt || '');

  if (!order_no) errors.push('请填写链动小铺订单号');
  else if (!ORDER_RE.test(order_no)) errors.push('订单号格式不正确，应为 LD 开头的字母数字组合（如 LD261008YXAAH0）');

  if (!redeem_code) errors.push('请填写卡密 / 兑换码');
  else if (!CODE_RE.test(redeem_code)) errors.push('兑换码格式不正确，应为 XXXX-XXXX-XXXX（如 9H6R-APN8-7URB）');

  if (!contact) errors.push('请填写联系方式');
  else if (contact.length < 4 || contact.length > 64) errors.push('联系方式长度不正确');

  const amountNum = parseAmount(amountRaw);
  if (amountNum === null) errors.push('退款金额不正确，请填写订单实付金额（如 96 或 133.9）');

  const validReasons = [
    'student_auth_failed',
    'code_already_used',
    'duplicate_or_wrong',
    'not_as_described',
    'other'
  ];
  if (!validReasons.includes(reason_code)) errors.push('请选择退款原因');
  if (reason_code === 'other' && description.length < 5) {
    errors.push('退款原因为「其他」时，请补充至少 5 个字的说明');
  }

  const validRedeemStates = ['not_passed', 'processing', 'disabled', 'used', 'unknown'];
  if (!validRedeemStates.includes(redeem_state)) errors.push('请选择兑换码当前状态');

  // 收款码有两种来源（对象存储地址 / 内联 base64），由路由层分流判断，这里不重复报错
  const parsed = parseReceipt(receipt);
  const receiptMime = parsed.ok ? parsed.value.mime : '';
  const receiptBase64 = parsed.ok ? parsed.value.data : '';

  return {
    ok: errors.length === 0,
    errors,
    receiptBase64,
    receiptMime,
    value: {
      order_no,
      redeem_code,
      contact,
      contact_type,
      contact_name,
      amount: amountNum === null ? '' : amountNum.toFixed(2),
      reason_code,
      redeem_state,
      description
    }
  };
}

/** 脱敏：联系方式只露前 2 后 2，用于用户自助查询回显 */
export function maskContact(contact: string): string {
  const c = normalizeContact(contact);
  if (c.length <= 4) return c.slice(0, 1) + '***';
  return `${c.slice(0, 2)}***${c.slice(-2)}`;
}

/** 脱敏：兑换码只露前 4 位 */
export function maskRedeemCode(code: string): string {
  const c = normalizeRedeemCode(code);
  return c.length > 4 ? `${c.slice(0, 4)}-****-****` : c;
}
