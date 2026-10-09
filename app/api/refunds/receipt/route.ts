import { NextRequest } from 'next/server';
import { clientIp, json } from '@/lib/http';
import { blobEnabled, extFromMime, receiptKey } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** 收款码单张体积上限（未压缩前），与前端压缩后的实际体积相比留足余量 */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > RATE_MAX;
}

/**
 * 上传收款码到对象存储（Vercel Blob）。
 *
 * 前端把压缩后的 JPEG 以 multipart/form-data 传来，避免走 base64 的大 JSON。
 * 这里只上传、不落库；真正的登记记录由 /api/refunds 写入，
 * 因此用户中途放弃时只会留下一个无人引用的对象，不影响业务数据一致性。
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req) || 'unknown';
  if (rateLimited(ip)) {
    return json({ ok: false, errors: ['上传过于频繁，请稍后再试。'] }, 429);
  }

  if (!blobEnabled()) {
    // 未配置对象存储时前端会退回「随表单一起提交 base64」的老路径
    return json({ ok: false, storage: 'database', errors: ['对象存储未启用'] }, 501);
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get('file');
    if (value instanceof File) file = value;
  } catch {
    return json({ ok: false, errors: ['上传数据解析失败，请重试。'] }, 400);
  }

  if (!file) return json({ ok: false, errors: ['没有收到图片文件。'] }, 400);
  if (!ALLOWED.includes(file.type)) {
    return json({ ok: false, errors: ['图片格式不支持，请上传 png / jpg / webp。'] }, 400);
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return json({ ok: false, errors: ['图片过大，请压缩到 5MB 以内后重试。'] }, 400);
  }

  try {
    const { put } = await import('@vercel/blob');
    const bytes = Buffer.from(await file.arrayBuffer());
    const key = receiptKey(extFromMime(file.type));
    const res = await put(key, bytes, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    return json({
      ok: true,
      data: {
        url: res.url,
        pathname: (res as any).pathname || key,
        bytes: bytes.length,
        storage: 'blob'
      }
    });
  } catch (err: any) {
    console.error('[receipt-upload] 上传失败', err);
    return json(
      { ok: false, storage: 'database', errors: ['图片上传失败，将改用随表单提交的方式。'] },
      500
    );
  }
}
