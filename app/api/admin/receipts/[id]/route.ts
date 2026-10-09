import { NextRequest } from 'next/server';
import { getRefundById } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 管理后台查看收款码（需登录，避免收款码被外部抓取） */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthenticated()) return json({ ok: false, errors: ['未登录'] }, 401);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, errors: ['id 不合法'] }, 400);

  const row = await getRefundById(id);
  if (!row) return json({ ok: false, errors: ['记录不存在'] }, 404);

  // 对象存储模式：服务端代理取回图片，不把 Blob 地址暴露给浏览器
  if (row.receipt_url) {
    try {
      const upstream = await fetch(row.receipt_url, { cache: 'no-store' });
      if (!upstream.ok || !upstream.body) {
        return json({ ok: false, errors: ['对象存储读取失败'] }, 502);
      }
      return new Response(upstream.body, {
        headers: {
          'content-type': upstream.headers.get('content-type') || row.receipt_mime || 'image/jpeg',
          'cache-control': 'private, max-age=300'
        }
      });
    } catch (err: any) {
      console.error('[admin-receipt] 代理对象存储失败', err?.message || err);
      return json({ ok: false, errors: ['图片读取失败，请稍后重试'] }, 502);
    }
  }

  // 兜底模式：图片以 base64 存在数据库里
  if (!row.receipt_data) return json({ ok: false, errors: ['收款码不存在'] }, 404);
  const buf = Buffer.from(row.receipt_data, 'base64');
  return new Response(buf, {
    headers: {
      'content-type': row.receipt_mime || 'image/jpeg',
      'cache-control': 'private, max-age=300',
      'content-length': String(buf.length)
    }
  });
}
