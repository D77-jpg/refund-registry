import { unstable_noStore as noStore } from 'next/cache';
import { healthCheck, redactUrl, resolvedDriver } from '@/lib/db';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * 诊断端点（只读）：输出「连的是哪个库、用哪条驱动、表里有几条」，
 * 用于排查「写入与读取不一致」这类问题。
 * 不返回任何账号密码，也不做任何写操作。
 */
export async function GET() {
  noStore();
  const raw = (process.env.DATABASE_URL || '').replace(/^\uFEFF/, '').trim();

  let host = '(未配置)';
  let database = '';
  if (raw) {
    try {
      const u = new URL(raw);
      host = u.host;
      database = u.pathname.replace(/^\//, '');
    } catch {
      host = '(连接串无法解析)';
    }
  }

  // 数据层自述
  let layer: any = null;
  try {
    layer = await healthCheck();
  } catch (err: any) {
    layer = { error: redactUrl(err?.message || String(err)) };
  }

  // 用 Neon HTTP 驱动直连查一次
  let httpProbe: any = null;
  let httpError = '';
  if (raw) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(raw, { cache: false } as any);
      const c = await sql('SELECT count(*)::int AS c FROM refunds');
      const rows = await sql(
        'SELECT id, order_no, status, created_at::text AS created_at FROM refunds ORDER BY id DESC LIMIT 5'
      );
      httpProbe = { count: c[0].c, rows };
    } catch (err: any) {
      httpError = redactUrl(err?.message || String(err));
    }
  }

  // 用 postgres.js 走 TCP 直连查一次（绕过 Neon HTTP 驱动）
  let tcpProbe: any = null;
  let tcpError = '';
  if (raw) {
    try {
      const mod: any = await import('postgres');
      const pg = (mod.default ?? mod)(raw, { max: 1, idle_timeout: 5, prepare: false });
      const c = await pg.unsafe('SELECT count(*)::int AS c FROM refunds');
      const backend = await pg.unsafe('SELECT current_database() AS db, pg_backend_pid() AS pid');
      tcpProbe = { count: c[0].c, backend: backend[0] };
      await pg.end({ timeout: 3 });
    } catch (err: any) {
      tcpError = redactUrl(err?.message || String(err));
    }
  }

  return json({
    ok: true,
    data: {
      dbHost: host,
      dbName: database,
      driver: resolvedDriver(raw),
      layer,
      httpProbe,
      httpError,
      tcpProbe,
      tcpError,
      deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || '(本地)',
      env: process.env.VERCEL_ENV || 'development',
      time: new Date().toISOString()
    }
  });
}
