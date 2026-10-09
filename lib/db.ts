import { promises as fs } from 'fs';
import path from 'path';
import type { RefundRow, RefundStatus } from './types';
import { deleteReceipt } from './storage';

/**
 * 数据层。两种存储后端：
 *
 * 1) PostgreSQL（线上正式用法）：配置 DATABASE_URL 即启用。
 *    - Neon / Vercel Postgres：走 HTTP 驱动（@neondatabase/serverless），Serverless 友好
 *    - Supabase / 其他 Postgres：走 postgres 驱动的 TCP 连接池
 *    - 建表由应用首次访问时自动完成，不需要手工执行 SQL
 *
 * 2) 本地 JSON 文件（仅本机测试兜底）：未配置 DATABASE_URL 时启用。
 *    ⚠️ Vercel 等 Serverless 环境文件系统只读，线上必须配置 DATABASE_URL。
 */

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS refunds (
  id            SERIAL PRIMARY KEY,
  order_no      TEXT NOT NULL UNIQUE,
  redeem_code   TEXT NOT NULL DEFAULT '',
  contact       TEXT NOT NULL DEFAULT '',
  contact_type  TEXT NOT NULL DEFAULT '',
  contact_name  TEXT NOT NULL DEFAULT '',
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason_code   TEXT NOT NULL DEFAULT '',
  redeem_state  TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  receipt_mime  TEXT NOT NULL DEFAULT '',
  receipt_data  TEXT NOT NULL DEFAULT '',
  receipt_url   TEXT NOT NULL DEFAULT '',
  receipt_pathname TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending',
  admin_note    TEXT NOT NULL DEFAULT '',
  refund_ref    TEXT NOT NULL DEFAULT '',
  ip            TEXT NOT NULL DEFAULT '',
  user_agent    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  refunded_at   TIMESTAMPTZ
)`;

const CREATE_INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds (status)`,
  `CREATE INDEX IF NOT EXISTS refunds_created_idx ON refunds (created_at DESC)`
];

/**
 * 结构升级语句。老版本的表缺少收款码对象存储相关的列，
 * 这里用 ADD COLUMN IF NOT EXISTS 做幂等迁移，避免手工执行 SQL。
 */
const MIGRATION_SQL = [
  `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS receipt_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE refunds ADD COLUMN IF NOT EXISTS receipt_pathname TEXT NOT NULL DEFAULT ''`
];

export function dbMode(): 'postgres' | 'local-file' {
  return process.env.DATABASE_URL ? 'postgres' : 'local-file';
}

/* ------------------------------------------------------------------ */
/* PostgreSQL：统一的 SQL 适配层                                        */
/* ------------------------------------------------------------------ */

/**
 * 两种驱动（Neon HTTP / postgres.js TCP）的调用签名不同，
 * 这里统一成 query(text, values) 与 exec(text)，其余业务代码不关心底层是谁。
 */
interface SqlClient {
  /** 参数化查询，返回行数组 */
  query(text: string, values?: unknown[]): Promise<any[]>;
  /** 执行 DDL / 多语句，无返回值 */
  exec(text: string): Promise<void>;
}

/** Neon 及 Vercel Postgres 走 HTTP 驱动；其他厂商（Supabase 等）走 TCP 连接池 */
function isNeonHttp(url: string): boolean {
  return /neon\.tech|neon\.build|vercel-storage\.com|\.neon\./i.test(url);
}

/**
 * 由连接串决定用哪条驱动。
 *
 * 默认策略：只要连接串是 Neon 系列就优先用 HTTP 驱动（Serverless 下最省连接）。
 * 但可以通过环境变量强制走 TCP：
 *   DB_FORCE_TCP=1     —— 强制用 postgres.js 走 TCP
 *   DB_FORCE_HTTP=1    —— 强制用 Neon HTTP 驱动
 * 排查「某个驱动读到陈旧数据」这类问题时，用它可以快速切换对比。
 */
export function resolvedDriver(url: string): 'neon-http' | 'postgres-tcp' | 'none' {
  if (!url) return 'none';
  if (process.env.DB_FORCE_TCP === '1') return 'postgres-tcp';
  if (process.env.DB_FORCE_HTTP === '1') return 'neon-http';
  return isNeonHttp(url) ? 'neon-http' : 'postgres-tcp';
}

/**
 * 读取连接串并清洗。
 * 环境变量在 Windows/某些平台被写入时可能带上 UTF-8 BOM（\uFEFF）或换行，
 * 这些不可见字符会让驱动报「不是合法的 URL」，所以统一在这里剥掉。
 */
function databaseUrl(): string {
  const raw = process.env.DATABASE_URL || '';
  return raw.replace(/^\uFEFF/, '').replace(/[\r\n\t]/g, '').trim();
}

/** 日志/接口输出用：抹掉连接串里的密码，避免泄露 */
export function redactUrl(text: string): string {
  return String(text || '')
    .replace(/:\/\/([^:@/\s]+):([^@/\s]+)@/g, '://$1:***@')
    .replace(/password=\S+/gi, 'password=***');
}

let clientPromise: Promise<SqlClient> | null = null;

async function getClient(): Promise<SqlClient> {
  if (!clientPromise) {
    clientPromise = (async (): Promise<SqlClient> => {
      const url = databaseUrl();
      const driver = resolvedDriver(url);

      if (driver === 'neon-http') {
        const mod: any = await import('@neondatabase/serverless');
        // 关键：Neon 的 HTTP 驱动底层用 fetch 发 SQL。若平台的 fetch 缓存层
        // 缓存了这些响应，就会出现「写入成功、读取却一直是旧值」的陈旧读，
        // 对退款核对是致命的（会把已退款的单当成待处理，导致重复打款）。
        // 这里显式声明不缓存，并关掉驱动自身的查询结果缓存。
        mod.neonConfig.fetchFunction = (input: any, init: any = {}) =>
          fetch(input, { ...init, cache: 'no-store' });
        const neonSql = mod.neon(url, { cache: false } as any);
        return {
          async query(text, values = []) {
            const rows = await neonSql(text, values as any[]);
            return (rows as any[]) || [];
          },
          async exec(text) {
            await neonSql(text, []);
          }
        };
      }

      const mod: any = await import('postgres');
      const pg = (mod.default ?? mod)(url, {
        max: 3,
        idle_timeout: 20,
        // Supabase 等连接池（PgBouncer）不支持预处理语句
        prepare: false
      });
      return {
        async query(text, values = []) {
          const rows = await pg.unsafe(text, values as any[]);
          return (rows as any[]) || [];
        },
        async exec(text) {
          await pg.unsafe(text);
        }
      };
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

let schemaReady: Promise<void> | null = null;

/** 首次访问时自动建表建索引，幂等 */
export function ensureSchema(): Promise<void> {
  if (dbMode() === 'local-file') return Promise.resolve();
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await getClient();
      await client.exec(CREATE_TABLE_SQL);
      for (const stmt of CREATE_INDEX_SQL) {
        await client.exec(stmt);
      }
      for (const stmt of MIGRATION_SQL) {
        await client.exec(stmt);
      }
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/* ------------------------------------------------------------------ */
/* 本地 JSON 文件兜底                                                   */
/* ------------------------------------------------------------------ */

interface LocalDb {
  rows: RefundRow[];
  nextId: number;
}

const DATA_DIR = process.env.LOCAL_DATA_DIR || path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'refunds.json');

let localCache: LocalDb | null = null;

async function localLoad(): Promise<LocalDb> {
  if (localCache) return localCache;
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as LocalDb;
    localCache = { rows: parsed.rows || [], nextId: parsed.nextId || 1 };
  } catch {
    localCache = { rows: [], nextId: 1 };
  }
  return localCache;
}

async function localSave(db: LocalDb): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

/* ------------------------------------------------------------------ */
/* 对外 API                                                            */
/* ------------------------------------------------------------------ */

export interface ListQuery {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  reason?: string;
}

export interface ListResult {
  rows: RefundRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: Record<string, number>;
}

export class DuplicateOrderError extends Error {
  constructor() {
    super('DUPLICATE_ORDER');
  }
}

/** 新建登记记录；订单号重复时抛 DuplicateOrderError */
export async function insertRefund(input: {
  order_no: string;
  redeem_code: string;
  contact: string;
  contact_type: string;
  contact_name: string;
  amount: string;
  reason_code: string;
  redeem_state: string;
  description: string;
  receipt_mime: string;
  /** 对象存储里的地址与对象键；为空则退回 receipt_data 存 base64 */
  receipt_url: string;
  receipt_pathname: string;
  receipt_data: string;
  ip: string;
  user_agent: string;
}): Promise<RefundRow> {
  if (dbMode() === 'local-file') {
    const db = await localLoad();
    if (db.rows.some((r) => r.order_no === input.order_no)) throw new DuplicateOrderError();
    const now = new Date().toISOString();
    const row: RefundRow = {
      id: db.nextId++,
      ...input,
      status: 'pending',
      admin_note: '',
      refund_ref: '',
      created_at: now,
      updated_at: now,
      refunded_at: null
    };
    db.rows.unshift(row);
    await localSave(db);
    return row;
  }

  await ensureSchema();
  const client = await getClient();

  try {
    const rows = await client.query(
      `INSERT INTO refunds (order_no, redeem_code, contact, contact_type, contact_name, amount,
                            reason_code, redeem_state, description, receipt_mime, receipt_data,
                            receipt_url, receipt_pathname, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        input.order_no,
        input.redeem_code,
        input.contact,
        input.contact_type,
        input.contact_name,
        input.amount,
        input.reason_code,
        input.redeem_state,
        input.description,
        input.receipt_mime,
        input.receipt_data,
        input.receipt_url || '',
        input.receipt_pathname || '',
        input.ip,
        input.user_agent
      ]
    );
    return rows[0] as RefundRow;
  } catch (err: any) {
    if (err && (err.code === '23505' || /duplicate key/i.test(String(err.message)))) {
      throw new DuplicateOrderError();
    }
    throw err;
  }
}

/** 按订单号查询，用于用户自助查询进度 */
export async function findByOrderNo(orderNo: string): Promise<RefundRow | null> {
  if (dbMode() === 'local-file') {
    const db = await localLoad();
    return db.rows.find((r) => r.order_no === orderNo) || null;
  }
  await ensureSchema();
  const client = await getClient();
  const rows = await client.query(`SELECT * FROM refunds WHERE order_no = $1 LIMIT 1`, [orderNo]);
  return (rows[0] as RefundRow) || null;
}

export async function getRefundById(id: number): Promise<RefundRow | null> {
  if (dbMode() === 'local-file') {
    const db = await localLoad();
    return db.rows.find((r) => r.id === id) || null;
  }
  await ensureSchema();
  const client = await getClient();
  const rows = await client.query(`SELECT * FROM refunds WHERE id = $1 LIMIT 1`, [id]);
  return (rows[0] as RefundRow) || null;
}

export async function listRefunds(query: ListQuery): Promise<ListResult> {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(query.pageSize) || 20));
  const status = query.status && query.status !== 'all' ? query.status : '';
  const reason = query.reason && query.reason !== 'all' ? query.reason : '';
  const q = (query.q || '').trim();

  if (dbMode() === 'local-file') {
    const db = await localLoad();
    let rows = [...db.rows];
    const stats: Record<string, number> = { all: rows.length, pending: 0, refunded: 0, rejected: 0 };
    for (const r of db.rows) stats[r.status] = (stats[r.status] || 0) + 1;
    if (status) rows = rows.filter((r) => r.status === status);
    if (reason) rows = rows.filter((r) => r.reason_code === reason);
    if (q) {
      const needle = q.toUpperCase();
      rows = rows.filter((r) =>
        [r.order_no, r.redeem_code, r.contact, r.contact_name, r.description]
          .join(' ')
          .toUpperCase()
          .includes(needle)
      );
    }
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const total = rows.length;
    return {
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
      total,
      page,
      pageSize,
      stats
    };
  }

  await ensureSchema();
  const client = await getClient();
  const like = `%${q}%`;
  const where = `($1 = '' OR status = $1)
      AND ($2 = '' OR reason_code = $2)
      AND ($3 = '' OR order_no ILIKE $4 OR redeem_code ILIKE $4
           OR contact ILIKE $4 OR contact_name ILIKE $4 OR description ILIKE $4)`;
  const base = [status, reason, q, like];

  const rows = await client.query(
    `SELECT * FROM refunds WHERE ${where} ORDER BY created_at DESC LIMIT $5 OFFSET $6`,
    [...base, pageSize, (page - 1) * pageSize]
  );

  const countRows = await client.query(`SELECT count(*)::int AS total FROM refunds WHERE ${where}`, base);

  const statRows = await client.query(`SELECT status, count(*)::int AS c FROM refunds GROUP BY status`);
  const stats: Record<string, number> = { all: 0, pending: 0, refunded: 0, rejected: 0 };
  for (const r of statRows as any[]) {
    stats[r.status] = Number(r.c);
    stats.all += Number(r.c);
  }

  return {
    rows: rows as RefundRow[],
    total: Number((countRows[0] as any)?.total || 0),
    page,
    pageSize,
    stats
  };
}

/** 导出用：按当前筛选条件取全部记录（防止一次拉太多，最多 3000 条） */
export async function exportRefunds(query: ListQuery): Promise<RefundRow[]> {
  const out: RefundRow[] = [];
  const maxPages = 30; // 30 * 100 = 3000 条
  for (let p = 1; p <= maxPages; p++) {
    const page = await listRefunds({ ...query, page: p, pageSize: 100 });
    out.push(...page.rows);
    if (page.rows.length === 0 || out.length >= page.total) break;
  }
  return out;
}

export async function updateRefundStatus(
  id: number,
  patch: { status: RefundStatus; admin_note?: string; refund_ref?: string }
): Promise<RefundRow | null> {
  const now = new Date().toISOString();
  if (dbMode() === 'local-file') {
    const db = await localLoad();
    const row = db.rows.find((r) => r.id === id);
    if (!row) return null;
    row.status = patch.status;
    if (patch.admin_note !== undefined) row.admin_note = patch.admin_note;
    if (patch.refund_ref !== undefined) row.refund_ref = patch.refund_ref;
    row.updated_at = now;
    row.refunded_at = patch.status === 'refunded' ? now : null;
    await localSave(db);
    return row;
  }

  await ensureSchema();
  const client = await getClient();
  const rows = await client.query(
    `UPDATE refunds SET
       status = $2,
       admin_note = COALESCE($3, admin_note),
       refund_ref = COALESCE($4, refund_ref),
       updated_at = now(),
       refunded_at = CASE WHEN $2 = 'refunded' THEN now() ELSE NULL END
     WHERE id = $1
     RETURNING *`,
    [id, patch.status, patch.admin_note ?? null, patch.refund_ref ?? null]
  );
  return (rows[0] as RefundRow) || null;
}

export async function bulkUpdateStatus(
  ids: number[],
  patch: { status: RefundStatus; admin_note?: string }
): Promise<number> {
  if (ids.length === 0) return 0;
  if (dbMode() === 'local-file') {
    let n = 0;
    for (const id of ids) {
      const r = await updateRefundStatus(id, patch);
      if (r) n++;
    }
    return n;
  }
  await ensureSchema();
  const client = await getClient();
  const rows = await client.query(
    `UPDATE refunds SET
       status = $2,
       admin_note = COALESCE($3, admin_note),
       updated_at = now(),
       refunded_at = CASE WHEN $2 = 'refunded' THEN now() ELSE NULL END
     WHERE id = ANY($1::int[])
     RETURNING id`,
    [ids, patch.status, patch.admin_note ?? null]
  );
  return rows.length;
}

export async function deleteRefund(id: number): Promise<boolean> {
  if (dbMode() === 'local-file') {
    const db = await localLoad();
    const idx = db.rows.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    const [removed] = db.rows.splice(idx, 1);
    await localSave(db);
    if (removed?.receipt_pathname) await deleteReceipt(removed.receipt_pathname);
    return true;
  }
  await ensureSchema();
  const client = await getClient();
  // 先取出对象键，删完记录后把对象存储里的收款码一并清掉（避免敏感图片长期留存）
  const rows = await client.query(
    `DELETE FROM refunds WHERE id = $1 RETURNING id, receipt_pathname`,
    [id]
  );
  if (rows.length === 0) return false;
  const pathname = (rows[0] as any)?.receipt_pathname;
  if (pathname) await deleteReceipt(pathname);
  return true;
}

export async function healthCheck(): Promise<{ ok: boolean; mode: string; detail: string }> {
  if (dbMode() === 'local-file') {
    return {
      ok: true,
      mode: 'local-file',
      detail: '本地文件存储（仅限本机测试，线上请配置 DATABASE_URL）'
    };
  }
  try {
    await ensureSchema();
    const client = await getClient();
    const rows = await client.query(`SELECT count(*)::int AS c FROM refunds`);
    return {
      ok: true,
      mode: 'postgres',
      detail: `已连接云数据库，当前 ${(rows[0] as any).c} 条登记记录`
    };
  } catch (err: any) {
    // 注意：驱动报错时可能把完整连接串（含密码）带进 message，必须抹掉再往外返回
    return { ok: false, mode: 'postgres', detail: `数据库连接失败：${redactUrl(err?.message || String(err))}` };
  }
}

/**
 * 仅用于排查的诊断探针：返回数据层查询的**原始结构**。
 * healthCheck 只读 rows[0].c，如果驱动返回的形状与预期不同，
 * 就会出现「计数莫名其妙」的情况，这里把原始值原样暴露出来对照。
 */
export async function __probeRawCount(): Promise<any> {
  await ensureSchema();
  const client = await getClient();
  const rows = (await client.query(`SELECT count(*)::int AS c FROM refunds`)) as any;
  return {
    isArray: Array.isArray(rows),
    length: rows?.length,
    first: rows?.[0],
    keysOfFirst: rows?.[0] ? Object.keys(rows[0]) : null,
    firstValue: rows?.[0]?.c,
    typeofFirstValue: typeof rows?.[0]?.c,
    stringified: JSON.stringify(rows)?.slice(0, 300)
  };
}
