import crypto from 'crypto';
import { cookies } from 'next/headers';

/**
 * 管理后台鉴权：固定密码 + HMAC 签名 Cookie。
 * - 不引入数据库依赖，密码放环境变量 ADMIN_PASSWORD。
 * - 会话 12 小时过期；改 AUTH_SECRET 可让所有已登录设备立即失效。
 * - 内置简单的失败次数限制，避免密码被暴力猜解。
 */

export const ADMIN_COOKIE = 'rr_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const LOCK_MS = 10 * 60 * 1000;

const attempts = new Map<string, { count: number; first: number; lockedUntil: number }>();

function secret(): string {
  return process.env.AUTH_SECRET || 'dev-only-insecure-secret';
}

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || 'admin123';
}

/** 生产环境必须改成自己的密码，否则给出警示 */
export function passwordIsDefault(): boolean {
  return !process.env.ADMIN_PASSWORD;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex');
}

export function createSessionToken(): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `admin.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [role, expStr, mac] = parts;
  if (role !== 'admin') return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = sign(`${role}.${expStr}`);
  const a = Buffer.from(mac, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isAuthenticated(): boolean {
  return verifySessionToken(cookies().get(ADMIN_COOKIE)?.value);
}

export function checkRateLimit(key: string): { locked: boolean; retryAfterSec: number } {
  const rec = attempts.get(key);
  if (!rec) return { locked: false, retryAfterSec: 0 };
  if (rec.lockedUntil > Date.now()) {
    return { locked: true, retryAfterSec: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.first > LOCK_MS) {
    attempts.set(key, { count: 1, first: now, lockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCK_MS;
    rec.count = 0;
    rec.first = now;
  }
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

/** 常量时间比较密码 */
export function passwordMatches(input: string): boolean {
  const a = Buffer.from(String(input || ''), 'utf8');
  const b = Buffer.from(adminPassword(), 'utf8');
  if (a.length !== b.length) {
    // 长度不同也要做一次比较，避免明显的时序差异
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export const SESSION_MAX_AGE_SEC = SESSION_TTL_MS / 1000;
