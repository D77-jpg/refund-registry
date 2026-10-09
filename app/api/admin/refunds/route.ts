import { NextRequest } from 'next/server';
import { exportRefunds, listRefunds, updateRefundStatus, bulkUpdateStatus, deleteRefund, dbMode } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';
import { json, reasonLabel, statusLabel, toCsv, formatDateTime } from '@/lib/http';
import type { RefundStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUS: RefundStatus[] = ['pending', 'refunded', 'rejected'];

function guard() {
  if (!isAuthenticated()) return json({ ok: false, errors: ['未登录或登录已过期'] }, 401);
  return null;
}

/** 列表 / 搜索 / 分页 / 导出 */
export async function GET(req: NextRequest) {
  const denied = guard();
  if (denied) return denied;

  const params = req.nextUrl.searchParams;
  const query = {
    status: params.get('status') || 'all',
    reason: params.get('reason') || 'all',
    q: params.get('q') || '',
    page: Number(params.get('page') || 1),
    pageSize: Number(params.get('pageSize') || 20)
  };

  if (params.get('export') === 'csv') {
    const rows = await exportRefunds(query);
    const csv = toCsv(
      rows.map((r) => ({
        编号: r.id,
        登记时间: formatDateTime(r.created_at),
        订单号: r.order_no,
        兑换码: r.redeem_code,
        退款金额: r.amount,
        工单状态: statusLabel(r.status),
        退款原因: reasonLabel(r.reason_code),
        兑换码状态: r.redeem_state,
        联系方式: r.contact,
        联系方式备注: r.contact_name,
        说明: r.description,
        收款码图片: r.id ? `见后台编号 #${r.id}` : '',
        处理备注: r.admin_note,
        退款凭证号: r.refund_ref,
        打款时间: formatDateTime(r.refunded_at),
        提交IP: r.ip
      }))
    );
    const stamp = formatDateTime(new Date()).replace(/[: ]/g, '-');
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="refund-registry-${stamp}.csv"`,
        'cache-control': 'no-store'
      }
    });
  }

  const result = await listRefunds(query);
  return json({
    ok: true,
    data: {
      ...result,
      mode: dbMode(),
      rows: result.rows.map((r) => {
        // 列表不返回 base64 图片本体，避免响应过大；图片走 /api/admin/receipts/[id]
        const { receipt_data, receipt_mime, ...rest } = r;
        return { ...rest, has_receipt: Boolean(receipt_data && receipt_data.length > 0) };
      })
    }
  });
}

/** 更新单条 / 批量更新状态 */
export async function PATCH(req: NextRequest) {
  const denied = guard();
  if (denied) return denied;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, errors: ['请求格式错误'] }, 400);
  }

  const status = String(body?.status || '') as RefundStatus;
  if (!VALID_STATUS.includes(status)) {
    return json({ ok: false, errors: ['状态不合法'] }, 400);
  }
  const admin_note = body?.admin_note === undefined ? undefined : String(body.admin_note).slice(0, 300);
  const refund_ref = body?.refund_ref === undefined ? undefined : String(body.refund_ref).slice(0, 80);

  const ids: number[] = Array.isArray(body?.ids)
    ? body.ids.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
    : body?.id
      ? [Number(body.id)]
      : [];

  if (ids.length === 0) return json({ ok: false, errors: ['缺少记录 id'] }, 400);

  if (ids.length === 1) {
    const row = await updateRefundStatus(ids[0], { status, admin_note, refund_ref });
    if (!row) return json({ ok: false, errors: ['记录不存在'] }, 404);
    const { receipt_data, receipt_mime, ...rest } = row;
    return json({ ok: true, data: { ...rest, has_receipt: Boolean(receipt_data) } });
  }

  const count = await bulkUpdateStatus(ids, { status, admin_note });
  return json({ ok: true, data: { updated: count } });
}

/** 删除登记记录（仅用于误填/测试数据） */
export async function DELETE(req: NextRequest) {
  const denied = guard();
  if (denied) return denied;

  const id = Number(req.nextUrl.searchParams.get('id') || 0);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, errors: ['缺少 id'] }, 400);
  const ok = await deleteRefund(id);
  return json({ ok, errors: ok ? undefined : ['记录不存在'] }, ok ? 200 : 404);
}
