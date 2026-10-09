import type { RefundReasonCode, RefundStatus } from './types';
import { REASON_LABEL, REFUND_STATUS_LABEL } from './types';

/** 统一 JSON 响应 */
export function json(data: unknown, init?: number | ResponseInit): Response {
  const responseInit: ResponseInit = typeof init === 'number' ? { status: init } : init || {};
  return new Response(JSON.stringify(data), {
    ...responseInit,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(responseInit.headers || {})
    }
  });
}

export function clientIp(req: Request): string {
  const h = req.headers;
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim().slice(0, 64);
  return (h.get('x-real-ip') || '').slice(0, 64);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

export function statusLabel(status: string): string {
  return REFUND_STATUS_LABEL[status as RefundStatus] || status;
}

export function reasonLabel(code: string): string {
  return REASON_LABEL[code as RefundReasonCode] || code || '-';
}

/** CSV 导出（带 BOM，Excel 打开中文不乱码） */
export function toCsv(rows: Record<string, string | number | null | undefined>[], headers?: string[]): string {
  const cols = headers && headers.length ? headers : rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    // 公式注入防护：以 = + - @ 开头的文本前置单引号
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [cols.map(esc).join(',')];
  for (const row of rows) {
    lines.push(cols.map((c) => esc(row[c])).join(','));
  }
  return '\ufeff' + lines.join('\r\n');
}
