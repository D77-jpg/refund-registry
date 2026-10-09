import { NextRequest } from 'next/server';
import { findByOrderNo } from '@/lib/db';
import { json } from '@/lib/http';
import { maskContact, maskRedeemCode, normalizeContact, normalizeOrderNo } from '@/lib/validate';
import { REDEEM_STATE_LABEL, REFUND_STATUS_LABEL, type RedeemState, type RefundStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 公开接口：用户凭「订单号 + 联系方式后 4 位」查询自己的退款进度。
 * 只返回脱敏后的必要字段，绝不返回收款码图片和完整联系方式。
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, errors: ['请求格式错误'] }, 400);
  }

  const orderNo = normalizeOrderNo(body?.order_no);
  const tail = normalizeContact(body?.contact_tail);

  if (!orderNo || !tail) {
    return json({ ok: false, errors: ['请填写订单号和联系方式后 4 位'] }, 400);
  }

  try {
    const row = await findByOrderNo(orderNo);
    if (!row) {
      return json(
        { ok: false, errors: ['没有查到这条登记记录。请确认订单号是否填写正确，或先提交登记。'] },
        404
      );
    }

    const contact = normalizeContact(row.contact);
    if (!contact.toUpperCase().endsWith(tail.toUpperCase())) {
      return json({ ok: false, errors: ['订单号与联系方式不匹配，请检查后重试。'] }, 403);
    }

    return json({
      ok: true,
      data: {
        order_no: row.order_no,
        redeem_code: maskRedeemCode(row.redeem_code),
        contact: maskContact(row.contact),
        amount: row.amount,
        status: row.status,
        status_label: REFUND_STATUS_LABEL[row.status as RefundStatus] || row.status,
        redeem_state_label: REDEEM_STATE_LABEL[row.redeem_state as RedeemState] || row.redeem_state,
        admin_note: row.admin_note || '',
        created_at: row.created_at,
        updated_at: row.updated_at,
        refunded_at: row.refunded_at
      }
    });
  } catch (err) {
    console.error('[refund-lookup] failed', err);
    return json({ ok: false, errors: ['查询失败，请稍后重试。'] }, 500);
  }
}
