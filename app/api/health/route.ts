import { healthCheck } from '@/lib/db';
import { json } from '@/lib/http';
import { blobEnabled } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 部署自检：确认线上是否已正确连上云数据库与对象存储。
 * 注意：只返回布尔标记和脱敏后的错误信息，绝不回显环境变量内容。
 */
export async function GET() {
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
