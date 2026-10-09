import { healthCheck } from '@/lib/db';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 部署自检：确认线上是否已正确连上云数据库 */
export async function GET() {
  const health = await healthCheck();
  return json(
    {
      ok: health.ok,
      data: {
        ...health,
        hasAdminPassword: Boolean(process.env.ADMIN_PASSWORD),
        hasAuthSecret: Boolean(process.env.AUTH_SECRET),
        time: new Date().toISOString()
      }
    },
    health.ok ? 200 : 500
  );
}
