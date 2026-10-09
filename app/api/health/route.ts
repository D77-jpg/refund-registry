import { unstable_noStore as noStore } from 'next/cache';
import { healthCheck } from '@/lib/db';
import { json } from '@/lib/http';
import { blobEnabled } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 数据库读取必须实时，任何缓存都会导致退款状态显示滞后
export const fetchCache = 'force-no-store';

/**
 * 部署自检：确认线上是否已正确连上云数据库与对象存储。
 * 注意：只返回布尔标记和脱敏后的错误信息，绝不回显环境变量内容。
 */
export async function GET() {
  // 退出 Next.js 的 fetch 缓存：Neon 的 HTTP 驱动底层用 fetch 发 SQL，
  // 不显式退出的话会读到缓存快照，出现「写入成功但读取一直是旧值」的陈旧读。
  noStore();
  const health = await healthCheck();
  return json(
    {
      ok: health.ok,
      data: {
        mode: health.mode,
        detail: health.detail,
        receiptStorage: blobEnabled() ? 'blob' : 'database',
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        hasBlobToken: blobEnabled(),
        hasAdminPassword: Boolean(process.env.ADMIN_PASSWORD),
        hasAuthSecret: Boolean(process.env.AUTH_SECRET),
        time: new Date().toISOString()
      }
    },
    health.ok ? 200 : 500
  );
}
