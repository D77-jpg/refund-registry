import crypto from 'crypto';

/**
 * 收款码图片的对象存储层。
 *
 * - 线上（Vercel）：存入 Vercel Blob 对象存储，数据库里只留 URL 与路径名。
 *   为了后续能按记录删除文件，需要把 access 固定为 'public'（Vercel 的 private store 目前需 Pro 套餐）。
 *   敏感度通过两点控制：
 *     1) 路径名带 16 字节随机串，无法枚举猜测；
 *     2) 后台页面只通过 /api/admin/receipts/[id]（需登录）访问，不把原始 Blob 地址暴露给用户端。
 * - 本地开发：没有 BLOB_READ_WRITE_TOKEN 时自动退回「base64 存数据库」，功能不受影响。
 */

export function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** 生成不可猜测的对象键：receipts/<随机>-<时间戳>.jpg */
export function receiptKey(ext = 'jpg'): string {
  const rand = crypto.randomBytes(16).toString('hex');
  return `receipts/${rand}-${Date.now()}.${ext}`;
}

export function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export interface StoredReceipt {
  /** 对象存储里的公开地址；为空表示退回 base64 存在数据库 */
  url: string;
  /** 对象键，用于删除 */
  pathname: string;
  /** 退回数据库模式时才有值 */
  data: string;
}

/**
 * 保存收款码。任何异常都不会让登记失败：
 * 上传对象存储失败时自动降级为把 base64 存进数据库。
 */
export async function saveReceipt(base64: string, mime: string): Promise<StoredReceipt> {
  const buf = Buffer.from(base64, 'base64');

  if (!blobEnabled()) {
    return { url: '', pathname: '', data: base64 };
  }

  try {
    const { put } = await import('@vercel/blob');
    const key = receiptKey(extFromMime(mime));
    const res = await put(key, buf, {
      access: 'public',
      contentType: mime || 'image/jpeg',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    return { url: res.url, pathname: (res as any).pathname || key, data: '' };
  } catch (err: any) {
    console.error('[receipt] 上传对象存储失败，降级为数据库存储：', err?.message || err);
    return { url: '', pathname: '', data: base64 };
  }
}

/** 删除对象存储里的收款码（删除记录时调用），失败不影响主流程 */
export async function deleteReceipt(pathname: string): Promise<void> {
  if (!pathname || !blobEnabled()) return;
  try {
    const { del } = await import('@vercel/blob');
    await del(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (err: any) {
    console.error('[receipt] 删除对象失败（可忽略）：', err?.message || err);
  }
}
