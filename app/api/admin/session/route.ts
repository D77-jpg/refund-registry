import { NextRequest } from 'next/server';
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE_SEC,
  checkRateLimit,
  clearFailures,
  createSessionToken,
  isAuthenticated,
  passwordMatches,
  recordFailure
} from '@/lib/auth';
import { clientIp, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** 当前登录状态 */
export async function GET() {
  return json({ ok: true, data: { authenticated: isAuthenticated() } });
}

/** 登录 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, errors: ['请求格式错误'] }, 400);
  }

  const ip = clientIp(req) || 'unknown';
  const limit = checkRateLimit(ip);
  if (limit.locked) {
    return json(
      { ok: false, errors: [`尝试次数过多，请 ${Math.ceil(limit.retryAfterSec / 60)} 分钟后再试。`] },
      429
    );
  }

  const password = String(body?.password || '');
  if (!password || !passwordMatches(password)) {
    recordFailure(ip);
    return json({ ok: false, errors: ['密码不正确'] }, 401);
  }

  clearFailures(ip);
  const token = createSessionToken();
  const res = json({ ok: true, data: { authenticated: true } });
  res.headers.append('set-cookie', serializeAdminCookie(token, SESSION_MAX_AGE_SEC));
  return res;
}

/** 退出登录 */
export async function DELETE() {
  const res = json({ ok: true });
  res.headers.append('set-cookie', serializeAdminCookie('', 0));
  return res;
}

function serializeAdminCookie(value: string, maxAge: number): string {
  const parts = [
    `${ADMIN_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}
