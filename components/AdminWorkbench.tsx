'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { REASON_LABEL, STATUS_META, type StatusKey } from './labels';

interface Row {
  id: number;
  order_no: string;
  redeem_code: string;
  contact: string;
  contact_type: string;
  contact_name: string;
  amount: string;
  reason_code: string;
  redeem_state: string;
  description: string;
  status: string;
  admin_note: string;
  refund_ref: string;
  ip: string;
  created_at: string;
  updated_at: string;
  refunded_at: string | null;
  has_receipt: boolean;
}

interface ListPayload {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  stats: Record<string, number>;
  mode: 'postgres' | 'local-file';
}

const CONTACT_META: Record<string, { label: string; icon: string }> = {
  wechat: { label: '微信', icon: '💬' },
  qq: { label: 'QQ', icon: '🐧' },
  phone: { label: '手机', icon: '📱' },
  other: { label: '其他', icon: '🔗' }
};

const REDEEM_STATE_TEXT: Record<string, string> = {
  not_passed: '未通过',
  processing: '处理中',
  disabled: '已停用',
  used: '已使用',
  unknown: '不清楚'
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];

/** 驳回时的常用话术，点一下即可填入备注 */
const NOTE_PRESETS = [
  '已核实，订单号与卡密不匹配',
  '卡密已被使用，不符合退款条件',
  '未查询到该订单号',
  '已完成退款，请查收'
];

function fmt(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function relTime(v: string | null): string {
  if (!v) return '';
  const diff = Date.now() - new Date(v).getTime();
  if (!Number.isFinite(diff) || diff < 0) return '';
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

export default function AdminWorkbench({ usingDefaultPassword }: { usingDefaultPassword: boolean }) {
  const [status, setStatus] = useState<string>('pending');
  const [reason, setReason] = useState<string>('all');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [payload, setPayload] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      status,
      reason,
      q,
      page: String(page),
      pageSize: String(pageSize)
    });
    try {
      const res = await fetch(`/api/admin/refunds?${params.toString()}`, { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setFlash({ type: 'err', text: data?.errors?.[0] || '加载失败' });
        return;
      }
      setPayload(data.data as ListPayload);
      setSelected([]);
    } catch {
      setFlash({ type: 'err', text: '网络异常，加载失败' });
    } finally {
      setLoading(false);
    }
  }, [status, reason, q, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const stats = payload?.stats || { all: 0, pending: 0, refunded: 0, rejected: 0 };
  const totalPages = payload ? Math.max(1, Math.ceil(payload.total / payload.pageSize)) : 1;

  const pendingSum = useMemo(
    () =>
      (payload?.rows || [])
        .filter((r) => r.status === 'pending')
        .reduce((acc, r) => acc + Number(r.amount || 0), 0),
    [payload]
  );

  async function patch(ids: number[], next: StatusKey, admin_note?: string, refund_ref?: string) {
    if (ids.length === 0) return;
    const res = await fetch('/api/admin/refunds', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids, status: next, admin_note, refund_ref })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      setFlash({ type: 'err', text: data?.errors?.[0] || '更新失败' });
      return;
    }
    setFlash({ type: 'ok', text: `已更新 ${ids.length} 条为「${STATUS_META[next].label}」` });
    setDetail(null);
    await load();
  }

  async function removeRow(id: number) {
    if (!window.confirm(`确认删除编号 #${id} 的登记记录？收款码图片也会一并删除，且不可恢复。`)) return;
    const res = await fetch(`/api/admin/refunds?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      setFlash({ type: 'err', text: '删除失败' });
      return;
    }
    setFlash({ type: 'ok', text: `已删除 #${id}` });
    setDetail(null);
    await load();
  }

  async function logout() {
    await fetch('/api/admin/session', { method: 'DELETE' });
    window.location.href = '/admin/login';
  }

  function exportCsv() {
    const params = new URLSearchParams({ status, reason, q, export: 'csv' });
    window.location.href = `/api/admin/refunds?${params.toString()}`;
  }

  function copyRow(r: Row, silent = false) {
    const text = [
      `订单号：${r.order_no}`,
      `兑换码：${r.redeem_code}`,
      `金额：¥${r.amount}`,
      `联系方式：${CONTACT_META[r.contact_type]?.label || r.contact_type} ${r.contact}`,
      r.contact_name ? `收款姓名/昵称：${r.contact_name}` : '',
      `原因：${REASON_LABEL[r.reason_code as keyof typeof REASON_LABEL] || r.reason_code}`
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard?.writeText(text);
    if (!silent) setFlash({ type: 'ok', text: `已复制 #${r.id} 的信息` });
  }

  const allOnPageSelected = payload ? payload.rows.length > 0 && selected.length === payload.rows.length : false;
  const activeFilterCount = (status !== 'pending' ? 1 : 0) + (reason !== 'all' ? 1 : 0) + (q ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl">
      {/* ============ 顶部标题区 ============ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">退款核实后台</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>共 {stats.all} 条登记</span>
            <span className="text-ink-300">·</span>
            <span>待人工退款 {stats.pending}</span>
            <span className="text-ink-300">·</span>
            <span>已退款 {stats.refunded}</span>
            <span className="text-ink-300">·</span>
            <span>已驳回 {stats.rejected}</span>
            {payload?.mode === 'local-file' ? (
              <span className="chip bg-rose-50 text-rose-700">本地文件存储，线上请配置 DATABASE_URL</span>
            ) : (
              <span className="chip bg-emerald-50 text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                云数据库已连接
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={load} disabled={loading}>
            <span className={loading ? 'inline-block animate-spin' : ''}>⟳</span>
            {loading ? '刷新中' : '刷新'}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={exportCsv}>
            ⬇ 导出 CSV
          </button>
          <Link href="/" className="btn-ghost btn-sm">
            用户登记页
          </Link>
          <button type="button" className="btn-ghost btn-sm" onClick={logout}>
            退出
          </button>
        </div>
      </div>

      {usingDefaultPassword ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ 尚未配置 <code className="font-mono">ADMIN_PASSWORD</code>，当前使用默认密码 admin123。
          请立即在 Vercel 项目 Settings → Environment Variables 配置后重新部署。
        </div>
      ) : null}

      {flash ? (
        <div
          className={`mt-4 animate-pop-in rounded-2xl px-4 py-3 text-sm ${
            flash.type === 'ok'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      {/* ============ 统计卡 ============ */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="待人工退款"
          value={stats.pending}
          tone="amber"
          icon="⏳"
          active={status === 'pending'}
          hint="需要你核实并打款"
          onClick={() => {
            setStatus('pending');
            setPage(1);
          }}
        />
        <StatCard
          label="已退款"
          value={stats.refunded}
          tone="emerald"
          icon="✓"
          active={status === 'refunded'}
          hint="已打款完成"
          onClick={() => {
            setStatus('refunded');
            setPage(1);
          }}
        />
        <StatCard
          label="已驳回"
          value={stats.rejected}
          tone="rose"
          icon="✕"
          active={status === 'rejected'}
          hint="不满足退款条件"
          onClick={() => {
            setStatus('rejected');
            setPage(1);
          }}
        />
        <StatCard
          label="全部登记"
          value={stats.all}
          tone="brand"
          icon="Σ"
          active={status === 'all'}
          hint={status === 'pending' ? `本页待退 ¥${pendingSum.toFixed(2)}` : '含所有状态'}
          onClick={() => {
            setStatus('all');
            setPage(1);
          }}
        />
      </div>

      {/* ============ 筛选工具栏 ============ */}
      <div className="card mt-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="field-label" htmlFor="admin-q">
              搜索
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-300">
                🔍
              </span>
              <input
                id="admin-q"
                className="input pl-9"
                placeholder="订单号 / 兑换码 / 联系方式 / 说明"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setQ(qInput.trim());
                    setPage(1);
                  }
                }}
              />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="admin-status">
              工单状态
            </label>
            <select
              id="admin-status"
              className="input min-w-[140px]"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="pending">待人工退款</option>
              <option value="refunded">已退款</option>
              <option value="rejected">已驳回</option>
              <option value="all">全部</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="admin-reason">
              退款原因
            </label>
            <select
              id="admin-reason"
              className="input min-w-[160px]"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">全部原因</option>
              {Object.entries(REASON_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary btn-sm h-[42px] px-5"
              onClick={() => {
                setQ(qInput.trim());
                setPage(1);
              }}
            >
              搜索
            </button>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="btn-ghost h-[42px]"
                onClick={() => {
                  setQ('');
                  setQInput('');
                  setReason('all');
                  setStatus('pending');
                  setPage(1);
                }}
              >
                重置{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>
            ) : null}
          </div>
        </div>

        {selected.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3.5 py-2.5 animate-fade-in">
            <span className="text-sm font-medium text-brand-700">已选择 {selected.length} 条</span>
            <button
              type="button"
              className="btn-success btn-sm"
              onClick={() => {
                if (window.confirm(`确认把选中的 ${selected.length} 条标记为「已退款」？`)) {
                  patch(selected, 'refunded');
                }
              }}
            >
              批量标记已退款
            </button>
            <button
              type="button"
              className="btn-danger btn-sm"
              onClick={() => {
                if (window.confirm(`确认把选中的 ${selected.length} 条标记为「已驳回」？`)) {
                  patch(selected, 'rejected');
                }
              }}
            >
              批量驳回
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected([])}>
              取消选择
            </button>
          </div>
        ) : null}
      </div>

      {/* ============ 列表 ============ */}
      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200/70 bg-ink-50/70 text-xs text-ink-500">
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="全选本页"
                    className="h-4 w-4 cursor-pointer rounded border-ink-300 accent-brand-600"
                    checked={allOnPageSelected}
                    onChange={(e) => {
                      if (!payload) return;
                      setSelected(e.target.checked ? payload.rows.map((r) => r.id) : []);
                    }}
                  />
                </th>
                <th className="px-3 py-3 font-medium">编号 / 登记时间</th>
                <th className="px-3 py-3 font-medium">订单号 / 兑换码</th>
                <th className="px-3 py-3 text-right font-medium">金额</th>
                <th className="px-3 py-3 font-medium">联系方式</th>
                <th className="px-3 py-3 font-medium">退款原因</th>
                <th className="px-3 py-3 font-medium">收款码</th>
                <th className="px-3 py-3 font-medium">状态</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {loading && !payload
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9} className="px-4 py-3">
                        <div className="skeleton h-14 w-full" />
                      </td>
                    </tr>
                  ))
                : payload?.rows.map((r) => {
                    const meta = STATUS_META[r.status as StatusKey] || STATUS_META.pending;
                    const contact = CONTACT_META[r.contact_type] || CONTACT_META.other;
                    return (
                      <tr key={r.id} className="group transition hover:bg-brand-50/40">
                        <td className="px-4 py-3.5 align-top">
                          <input
                            type="checkbox"
                            aria-label={`选择 #${r.id}`}
                            className="mt-0.5 h-4 w-4 cursor-pointer rounded border-ink-300 accent-brand-600"
                            checked={selected.includes(r.id)}
                            onChange={(e) =>
                              setSelected((prev) =>
                                e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id)
                              )
                            }
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 align-top">
                          <div className="font-semibold text-ink-900">#{r.id}</div>
                          <div className="mt-0.5 text-xs text-ink-400">{fmt(r.created_at)}</div>
                          <div className="text-[11px] text-ink-300">{relTime(r.created_at)}</div>
                        </td>
                        <td className="px-3 py-3.5 align-top">
                          <button
                            type="button"
                            onClick={() => copyRow(r, true)}
                            title="点击复制完整信息"
                            className="block max-w-full truncate rounded font-mono text-xs font-semibold text-ink-900 transition hover:text-brand-600"
                          >
                            {r.order_no}
                          </button>
                          <div className="mt-1 font-mono text-xs text-ink-500">{r.redeem_code}</div>
                          <div className="mt-1 text-[11px] text-ink-400">
                            兑换码：{REDEEM_STATE_TEXT[r.redeem_state] || r.redeem_state}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right align-top font-mono text-sm font-semibold text-ink-900">
                          ¥{r.amount}
                        </td>
                        <td className="px-3 py-3.5 align-top">
                          <div className="flex items-center gap-1.5 text-xs text-ink-400">
                            <span>{contact.icon}</span>
                            {contact.label}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-ink-700">{r.contact}</div>
                          {r.contact_name ? (
                            <div className="mt-0.5 text-[11px] text-ink-400">{r.contact_name}</div>
                          ) : null}
                        </td>
                        <td className="max-w-[220px] px-3 py-3.5 align-top">
                          <span className="chip bg-ink-100 text-ink-600">
                            {REASON_LABEL[r.reason_code as keyof typeof REASON_LABEL] || r.reason_code}
                          </span>
                          {r.description ? (
                            <div className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-500">
                              {r.description}
                            </div>
                          ) : null}
                          {r.admin_note ? (
                            <div className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                              备注：{r.admin_note}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3.5 align-top">
                          {r.has_receipt ? (
                            <button
                              type="button"
                              onClick={() => setDetail(r)}
                              className="group/img relative block overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:border-brand-400 hover:shadow-lift"
                              title="点击查看大图并核实"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/admin/receipts/${r.id}`}
                                alt={`收款码 ${r.id}`}
                                className="h-[68px] w-[68px] object-cover"
                              />
                              <span className="absolute inset-0 grid place-items-center bg-ink-900/0 text-xs font-medium text-white opacity-0 transition group-hover/img:bg-ink-900/45 group-hover/img:opacity-100">
                                查看
                              </span>
                            </button>
                          ) : (
                            <span className="text-xs text-ink-300">无</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 align-top">
                          <span className={`badge ${meta.cls}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                          {r.refunded_at ? (
                            <div className="mt-1.5 text-[11px] text-ink-400">{fmt(r.refunded_at)}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <div className="flex flex-col items-end gap-1.5">
                            <button
                              type="button"
                              className="btn-ghost btn-sm w-[92px]"
                              onClick={() => setDetail(r)}
                            >
                              核实详情
                            </button>
                            {r.status !== 'refunded' ? (
                              <button
                                type="button"
                                className="btn-success btn-sm w-[92px]"
                                onClick={() => {
                                  if (window.confirm(`确认 #${r.id} 已打款并标记为「已退款」？`)) {
                                    patch([r.id], 'refunded');
                                  }
                                }}
                              >
                                标记已退款
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn-ghost btn-sm w-[92px]"
                              onClick={() => copyRow(r)}
                            >
                              复制信息
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* 空态 */}
        {!loading && payload && payload.rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ink-100 text-2xl">
              {activeFilterCount > 0 ? '🔍' : '🎉'}
            </span>
            <p className="mt-3 text-sm font-medium text-ink-700">
              {activeFilterCount > 0 ? '当前筛选条件下没有记录' : '暂时没有待处理的登记'}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {activeFilterCount > 0 ? '试试放宽筛选条件或清空搜索关键词' : '有新的用户登记时会出现在这里'}
            </p>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="btn-ghost btn-sm mt-4"
                onClick={() => {
                  setQ('');
                  setQInput('');
                  setReason('all');
                  setStatus('all');
                  setPage(1);
                }}
              >
                查看全部登记
              </button>
            ) : null}
          </div>
        ) : null}

        {/* 分页 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 bg-ink-50/50 px-4 py-3 text-sm">
          <div className="text-xs text-ink-500">
            共 <span className="font-medium text-ink-700">{payload?.total ?? 0}</span> 条 · 第{' '}
            {payload?.page ?? 1}/{totalPages} 页
            {status === 'pending' && payload?.rows.length ? (
              <span className="ml-2 text-amber-600">本页合计 ¥{pendingSum.toFixed(2)}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input h-9 w-[104px] py-0 text-xs"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              aria-label="每页条数"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  每页 {n} 条
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={(payload?.page ?? 1) <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← 上一页
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={(payload?.page ?? 1) >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页 →
            </button>
          </div>
        </div>
      </div>

      {detail ? (
        <DetailDrawer
          row={detail}
          onClose={() => setDetail(null)}
          onPatch={patch}
          onDelete={removeRow}
          onCopy={copyRow}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------ 统计卡 ------------------------------ */
function StatCard({
  label,
  value,
  value2,
  tone,
  icon,
  active,
  hint,
  onClick
}: {
  label: string;
  value: number;
  value2?: number;
  tone: 'amber' | 'emerald' | 'rose' | 'brand';
  icon: string;
  active: boolean;
  hint: string;
  onClick: () => void;
}) {
  const tones = {
    amber: { text: 'text-amber-600', bg: 'bg-amber-50', ring: 'border-amber-300' },
    emerald: { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'border-emerald-300' },
    rose: { text: 'text-rose-600', bg: 'bg-rose-50', ring: 'border-rose-300' },
    brand: { text: 'text-brand-600', bg: 'bg-brand-50', ring: 'border-brand-400' }
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`stat-card ${active ? `${tones.ring} ring-2 ring-offset-0` : 'border-ink-200/80'}`}
      aria-pressed={active}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-ink-500">{label}</span>
        <span className={`grid h-7 w-7 place-items-center rounded-lg text-xs ${tones.bg} ${tones.text}`}>
          {icon}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-2xl font-bold tabular-nums ${tones.text}`}>{value}</span>
        {value2 !== undefined ? <span className="text-xs text-ink-400">{value2}</span> : null}
      </div>
      <div className="mt-0.5 text-[11px] text-ink-400">{hint}</div>
    </button>
  );
}

/* ------------------------------ 详情抽屉 ------------------------------ */
function DetailDrawer({
  row,
  onClose,
  onPatch,
  onDelete,
  onCopy
}: {
  row: Row;
  onClose: () => void;
  onPatch: (ids: number[], next: StatusKey, note?: string, ref?: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onCopy: (r: Row) => void;
}) {
  const [note, setNote] = useState(row.admin_note || '');
  const [ref, setRef] = useState(row.refund_ref || '');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const meta = STATUS_META[row.status as StatusKey] || STATUS_META.pending;
  const contact = CONTACT_META[row.contact_type] || CONTACT_META.other;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function act(next: StatusKey) {
    setBusy(true);
    try {
      await onPatch([row.id], next, note, ref);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-ink-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex h-full w-full max-w-xl animate-pop-in flex-col bg-white shadow-2xl">
        {/* 抽屉头部 */}
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-semibold text-ink-900">退款核实 · #{row.id}</h2>
              <span className={`badge ${meta.cls}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-400">
              登记于 {fmt(row.created_at)} {relTime(row.created_at) ? `· ${relTime(row.created_at)}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => onCopy(row)}>
              复制信息
            </button>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          </div>
        </header>

        {/* 抽屉主体 */}
        <div className="flex-1 overflow-y-auto">
          {/* 金额条 */}
          <div className="grid grid-cols-3 divide-x divide-ink-100 border-b border-ink-100 bg-ink-50/50">
            <div className="px-4 py-3">
              <div className="text-[11px] text-ink-400">退款金额</div>
              <div className="mt-0.5 font-mono text-lg font-bold text-ink-900">¥{row.amount}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[11px] text-ink-400">兑换码状态</div>
              <div className="mt-0.5 text-sm font-medium text-ink-800">
                {REDEEM_STATE_TEXT[row.redeem_state] || row.redeem_state}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[11px] text-ink-400">退款原因</div>
              <div className="mt-0.5 truncate text-sm font-medium text-ink-800" title={REASON_LABEL[row.reason_code as keyof typeof REASON_LABEL]}>
                {REASON_LABEL[row.reason_code as keyof typeof REASON_LABEL] || row.reason_code}
              </div>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5">
            {/* 关键信息 */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">订单信息</h3>
              <div className="space-y-2">
                <KV k="订单号" v={row.order_no} mono copyable />
                <KV k="兑换码" v={row.redeem_code} mono copyable />
                <KV
                  k="联系方式"
                  v={`${contact.icon} ${contact.label}：${row.contact}`}
                  copyable
                />
                {row.contact_name ? <KV k="收款姓名/昵称" v={row.contact_name} /> : null}
                <KV k="提交 IP" v={row.ip || '-'} />
                {row.refunded_at ? <KV k="打款时间" v={fmt(row.refunded_at)} /> : null}
                {row.refund_ref ? <KV k="退款凭证号" v={row.refund_ref} mono /> : null}
              </div>
            </section>

            {/* 用户说明 */}
            {row.description ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">用户说明</h3>
                <p className="whitespace-pre-wrap rounded-xl bg-ink-50 px-3.5 py-3 text-sm leading-relaxed text-ink-700">
                  {row.description}
                </p>
              </section>
            ) : null}

            {/* 收款码 */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                收款码（点击放大）
              </h3>
              {row.has_receipt ? (
                <button
                  type="button"
                  onClick={() => setZoom(true)}
                  className="block overflow-hidden rounded-2xl border border-ink-200 bg-white transition hover:border-brand-400 hover:shadow-lift"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/receipts/${row.id}`}
                    alt={`收款码 ${row.id}`}
                    className="max-h-[260px] w-auto object-contain"
                  />
                </button>
              ) : (
                <p className="rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-400">该登记没有收款码</p>
              )}
            </section>

            {/* 处理备注 */}
            <section>
              <label className="field-label" htmlFor="modal-note">
                处理备注 <span className="font-normal text-ink-400">（用户在查询页可见）</span>
              </label>
              <textarea
                id="modal-note"
                className="input min-h-[72px] resize-y text-sm leading-relaxed"
                maxLength={300}
                placeholder="例如：已核实认证失败，2026-10-09 通过微信转账退款"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {NOTE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="rounded-full border border-ink-200 px-2.5 py-1 text-[11px] text-ink-500 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                    onClick={() => setNote(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <label className="field-label" htmlFor="modal-ref">
                退款凭证号 / 流水号 <span className="font-normal text-ink-400">（选填）</span>
              </label>
              <input
                id="modal-ref"
                className="input text-sm"
                placeholder="如微信转账单号"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
              />
            </section>
          </div>
        </div>

        {/* 抽屉底部操作 */}
        <footer className="border-t border-ink-100 bg-ink-50/60 px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="text-xs text-ink-400 transition hover:text-rose-600"
              onClick={() => onDelete(row.id)}
            >
              删除这条记录
            </button>
            <div className="flex flex-wrap gap-2">
              {row.status !== 'pending' ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => act('pending')}
                >
                  重置为待退款
                </button>
              ) : null}
              {row.status !== 'rejected' ? (
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  disabled={busy}
                  onClick={() => act('rejected')}
                >
                  驳回
                </button>
              ) : null}
              <button
                type="button"
                className="btn-success"
                disabled={busy || row.status === 'refunded'}
                onClick={() => act('refunded')}
              >
                {busy ? '提交中…' : row.status === 'refunded' ? '已退款' : '确认已退款'}
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* 收款码放大 */}
      {zoom ? (
        <div
          className="absolute inset-0 z-10 grid animate-fade-in place-items-center bg-ink-900/80 p-4"
          onClick={() => setZoom(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/admin/receipts/${row.id}`}
            alt={`收款码 ${row.id} 放大`}
            className="max-h-[85vh] max-w-full animate-pop-in rounded-2xl bg-white object-contain p-2 shadow-2xl"
          />
          <p className="mt-3 text-xs text-white/70">点击任意处关闭</p>
        </div>
      ) : null}
    </div>
  );
}

function KV({ k, v, mono, copyable }: { k: string; v: string; mono?: boolean; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-baseline justify-between gap-3 divider-dashed pb-2">
      <span className="shrink-0 text-xs text-ink-400">{k}</span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={`truncate text-right text-sm font-medium text-ink-900 ${mono ? 'font-mono' : ''}`}>
          {v}
        </span>
        {copyable ? (
          <button
            type="button"
            className="shrink-0 text-[11px] text-ink-300 transition hover:text-brand-600"
            onClick={() => {
              navigator.clipboard?.writeText(v);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? '已复制' : '复制'}
          </button>
        ) : null}
      </span>
    </div>
  );
}
