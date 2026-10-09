import { promises as fs } from 'fs';
import path from 'path';
import type { RefundRow, RefundStatus } from './types';

/**
 * 数据层。两种后端：
 *
 * 1) PostgreSQL（线上正式用法）：配置 DATABASE_URL 即启用。
 *    - Neon / Vercel Postgres：走 HTTP 驱动（@neondatabase/serverless），Serverless 友好
 *    - Supabase / 其他：走 postgres 驱动的 TCP 连接池
 *    - 建表由应用自动完成，不需要手工执行 SQL
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

export function dbMode(): 'postgres' | 'local-file' {
  return process.env.DATABASE_URL ? 'postgres' : 'local-file';
}

/* ------------------------------------------------------------------ */
/* PostgreSQL                                                          */
/* ------------------------------------------------------------------ */

type SqlTag = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

/** Neon 与其托管的 Vercel Postgres 支持 HTTP 驱动；其他厂商走 TCP 连接池 */
function isNeonHttp(url: string): boolean {
  return /neon\.tech|neon\.build|vercel-storage\.com|\.neon\./i.test(url);
}

let sqlPromise: Promise<SqlTag> | null = null;

async function getSql(): Promise<SqlTag> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const url = process.env.DATABASE_URL as string;
      if (isNeonHttp(url)) {
        const mod: any = await import('@neondatabase/serverless');
        return mod.neon(url) as SqlTag;
      }
      const mod: any = await import('postgres');
      const pg = (mod.default ?? mod)(url, { max: 3, idle_timeout: 20, prepare: false });
      return pg as unknown as SqlTag;
    })();
  }
  return sqlPromise;
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (dbMode() === 'local-file') return Promise.resolve();
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql: any = await getSql();
      await sql.unsafe(CREATE_TABLE_SQL);
      for (const stmt of CREATE_INDEX_SQL) {
        await sql.unsafe(stmt);
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
export async function insertRefund(
  input: {
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
    receipt_data: string;
    ip: string;
    user_agent: string;
  }
): Promise<RefundRow> {
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
  const sql = await getSql();
  const existing = await sql`SELECT id FROM refunds WHERE order_no = ${input.order_no} LIMIT 1`;
  if (existing.length > 0) throw new DuplicateOrderError();

  try {
    const rows = await sql`
      INSERT INTO refunds (order_no, redeem_code, contact, contact_type, contact_name, amount,
                           reason_code, redeem_state, description, receipt_mime, receipt_data, ip, user_agent)
      VALUES (${input.order_no}, ${input.redeem_code}, ${input.contact}, ${input.contact_type},
              ${input.contact_name}, ${input.amount}, ${input.reason_code}, ${input.redeem_state},
              ${input.description}, ${input.receipt_mime}, ${input.receipt_data}, ${input.ip}, ${input.user_agent})
      RETURNING *`;
    return rows[0] as RefundRow;
  } catch (err: any) {
    if (err && (err.code === '23505' || /duplicate key/i.test(String(err.message)))) {
      throw new DuplicateOrderError();
    }
    throw err;
  }
}

/** 按订单号查询（含校验联系方式），用于用户自助查询进度 */
export async function findByOrderNo(orderNo: string): Promise<RefundRow | null> {
  if (dbMode() === 'local-file') {
    const db = await localLoad();
    return db.rows.find((r) => r.order_no === orderNo) || null;
  }
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql`SELECT * FROM refunds WHERE order_no = ${orderNo} LIMIT 1`;
  return (rows[0] as RefundRow) || null;
}

export async function getRefundById(id: number): Promise<RefundRow | null> {
  if (dbMode() === 'local-file') {
    const db = await localLoad();
    return db.rows.find((r) => r.id === id) || null;
  }
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql`SELECT * FROM refunds WHERE id = ${id} LIMIT 1`;
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
  const sql = await getSql();
  const like = `%${q}%`;
  const rows = await sql`
    SELECT * FROM refunds
    WHERE (${status} = '' OR status = ${status})
      AND (${reason} = '' OR reason_code = ${reason})
      AND (${q} = '' OR order_no ILIKE ${like} OR redeem_code ILIKE ${like}
           OR contact ILIKE ${like} OR contact_name ILIKE ${like} OR description ILIKE ${like})
    ORDER BY created_at DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;

  const countRows = await sql`
    SELECT count(*)::int AS total FROM refunds
    WHERE (${status} = '' OR status = ${status})
      AND (${reason} = '' OR reason_code = ${reason})
      AND (${q} = '' OR order_no ILIKE ${like} OR redeem_code ILIKE ${like}
           OR contact ILIKE ${like} OR contact_name ILIKE ${like} OR description ILIKE ${like})`;

  const statRows = await sql`SELECT status, count(*)::int AS c FROM refunds GROUP BY status`;
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
  const sql = await getSql();
  const rows = await sql`
    UPDATE refunds SET
      status = ${patch.status},
      admin_note = COALESCE(${patch.admin_note ?? null}, admin_note),
      refund_ref = COALESCE(${patch.refund_ref ?? null}, refund_ref),
      updated_at = now(),
      refunded_at = CASE WHEN ${patch.status} = 'refunded' THEN now() ELSE NULL END
    WHERE id = ${id}
    RETURNING *`;
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
  const sql = await getSql();
  const rows = await sql`
    UPDATE refunds SET
      status = ${patch.status},
      admin_note = COALESCE(${patch.admin_note ?? null}, admin_note),
      updated_at = now(),
      refunded_at = CASE WHEN ${patch.status} = 'refunded' THEN now() ELSE NULL END
    WHERE id = ANY(${ids})
    RETURNING id`;
  return rows.length;
}

export async function deleteRefund(id: number): Promise<boolean> {
  if (dbMode() === 'local-file') {
    const db = await localLoad();
    const idx = db.rows.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    db.rows.splice(idx, 1);
    await localSave(db);
    return true;
  }
  await ensureSchema();
  const sql = await getSql();
  const rows = await sql`DELETE FROM refunds WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function healthCheck(): Promise<{ ok: boolean; mode: string; detail: string }> {
  if (dbMode() === 'local-file') {
    return { ok: true, mode: 'local-file', detail: '本地文件存储（仅限本机测试，线上请配置 DATABASE_URL）' };
  }
  try {
    await ensureSchema();
    const sql = await getSql();
    const rows = await sql`SELECT count(*)::int AS c FROM refunds`;
    return { ok: true, mode: 'postgres', detail: `已连接云数据库，当前 ${(rows[0] as any).c} 条登记记录` };
  } catch (err: any) {
    return { ok: false, mode: 'postgres', detail: `数据库连接失败：${err?.message || err}` };
  }
}
