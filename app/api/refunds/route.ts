import { NextRequest } from 'next/server';
import { DuplicateOrderError, insertRefund } from '@/lib/db';
import { parseReceipt, parseReceiptUrl, validateRefundInput } from '@/lib/validate';
import { clientIp, json } from '@/lib/http';
import { deleteReceipt } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 公开接口：用户提交退款登记。
 * 安全措施：
 * - 全字段服务端二次校验
 * - 同订单号唯一（数据库唯一索引兜底）
 * - 简单频率限制，防止脚本刷单
 */
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 12;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > RATE_MAX;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req) || 'unknown';
  if (rateLimited(ip)) {
    return json({ ok: false, errors: ['提交过于频繁，请 1 分钟后再试。'] }, 429);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, errors: ['请求格式错误，请刷新页面重试。'] }, 400);
  }

  // 蜜罐字段：正常用户看不到，被填写即为机器人
  if (body && typeof body.__hp === 'string' && body.__hp.trim() !== '') {
    return json({ ok: true, data: { order_no: 'LD0000000000000', id: 0 } });
  }

  const result = validateRefundInput(body);
  if (!result.ok) {
    return json({ ok: false, errors: result.errors }, 400);
  }

  // 收款码优先用对象存储地址（前端已单独上传），否则退回内联 base64
  const fromBlob = parseReceiptUrl(body?.receipt_url);
  const receipt_url = fromBlob?.url || '';
  const receipt_pathname = fromBlob?.pathname || '';
  const receipt_data = fromBlob ? '' : result.receiptBase64;
  const receipt_mime = fromBlob ? 'image/jpeg' : result.receiptMime;

  if (!fromBlob && !receipt_data) {
    // 既没有合法的对象存储地址，也没有合法的 base64 图片，把具体原因告诉用户
    const why = parseReceipt(body?.receipt);
    return json(
      { ok: false, errors: [why.ok ? '请上传收款码截图（微信或支付宝）' : why.error] },
      400
    );
  }

  try {
    const row = await insertRefund({
      order_no: result.value.order_no,
      redeem_code: result.value.redeem_code,
      contact: result.value.contact,
      contact_type: result.value.contact_type,
      contact_name: result.value.contact_name,
      amount: result.value.amount,
      reason_code: result.value.reason_code,
      redeem_state: result.value.redeem_state,
      description: result.value.description,
      receipt_mime,
      receipt_data,
      receipt_url,
      receipt_pathname,
      ip,
      user_agent: (req.headers.get('user-agent') || '').slice(0, 300)
    });
    return json({
      ok: true,
      data: {
        id: row.id,
        order_no: row.order_no,
        status: row.status,
        created_at: row.created_at
      }
    });
  } catch (err: any) {
    // 登记没有落库时，把已经上传的收款码清掉，避免对象存储里堆无人引用的敏感图片
    if (receipt_pathname) await deleteReceipt(receipt_pathname);

    if (err instanceof DuplicateOrderError) {
      return json(
        {
          ok: false,
          code: 'DUPLICATE_ORDER',
          errors: ['该订单号已经登记过了，请勿重复提交。你可以用订单号查询当前退款进度。']
        },
        409
      );
    }
    console.error('[refund-submit] failed', err);
    return json(
      {
        ok: false,
        errors: ['服务器繁忙，提交失败。请稍后重试；若持续失败请联系客服人工登记。']
      },
      500
    );
  }
}
