import { NextRequest } from 'next/server';
import { getRefundById } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 管理后台查看收款码原图（需登录，避免收款码被外部抓取） */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthenticated()) return json({ ok: false, errors: ['未登录'] }, 401);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, errors: ['id 不合法'] }, 400);

  const row = await getRefundById(id);
  if (!row || !row.receipt_data) return json({ ok: false, errors: ['收款码不存在'] }, 404);

  const buf = Buffer.from(row.receipt_data, 'base64');
  return new Response(buf, {
    headers: {
      'content-type': row.receipt_mime || 'image/jpeg',
      'cache-control': 'private, max-age=300',
      'content-length': String(buf.length)
    }
  });
}
