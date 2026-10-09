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

const CONTACT_TYPE_LABEL: Record<string, string> = {
  wechat: '微信',
  qq: 'QQ',
  phone: '手机',
  other: '其他'
};

const PAGE_SIZE = 20;

function fmt(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function AdminWorkbench({ usingDefaultPassword }: { usingDefaultPassword: boolean }) {
  const [status, setStatus] = useState<string>('pending');
  const [reason, setReason] = useState<string>('all');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [page, setPage] = useState(1);
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
      pageSize: String(PAGE_SIZE)
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
  }, [status, reason, q, page]);

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

  const pendingAmount = useMemo(() => {
    if (!payload) return '0.00';
    const sum = payload.rows
      .filter((r) => r.status === 'pending')
      .reduce((acc, r) => acc + Number(r.amount || 0), 0);
    return sum.toFixed(2);
  }, [payload]);

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
    setFlash({ type: 'ok', text: `已更新 ${ids.length} 条记录为「${STATUS_META[next].label}」` });
    setDetail(null);
    await load();
  }

  async function removeRow(id: number) {
    if (!window.confirm(`确认删除编号 #${id} 的登记记录？此操作不可恢复。`)) return;
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

  function copyRow(r: Row) {
    const text = [
      `订单号：${r.order_no}`,
      `兑换码：${r.redeem_code}`,
      `金额：¥${r.amount}`,
      `联系方式：${CONTACT_TYPE_LABEL[r.contact_type] || r.contact_type} ${r.contact}`,
      r.contact_name ? `收款姓名/昵称：${r.contact_name}` : '',
      `原因：${REASON_LABEL[r.reason_code as keyof typeof REASON_LABEL] || r.reason_code}`
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard?.writeText(text);
    setFlash({ type: 'ok', text: `已复制 #${r.id} 的信息，可直接粘贴到备注里` });
  }

  const allOnPageSelected = payload ? payload.rows.length > 0 && selected.length === payload.rows.length : false;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">退款核实后台</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            共 {stats.all} 条登记 · 待人工退款 {stats.pending} · 已退款 {stats.refunded} · 已驳回{' '}
            {stats.rejected}
            {payload?.mode === 'local-file' ? (
              <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 font-medium text-rose-700">
                当前为本地文件存储，数据未入库（线上请配置 DATABASE_URL）
              </span>
            ) : (
              <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
                云数据库已连接
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" onClick={load} disabled={loading}>
            {loading ? '刷新中…' : '刷新'}
          </button>
          <button type="button" className="btn-ghost" onClick={exportCsv}>
            导出 CSV
          </button>
          <Link href="/" className="btn-ghost">
            用户登记页
          </Link>
          <button type="button" className="btn-ghost" onClick={logout}>
            退出
          </button>
        </div>
      </div>

      {usingDefaultPassword ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ 尚未配置 <code className="font-mono">ADMIN_PASSWORD</code>，当前使用默认密码 admin123。请立即在
          Vercel 项目 Settings → Environment Variables 里配置后重新部署。
        </div>
      ) : null}

      {flash ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            flash.type === 'ok'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="待人工退款" value={stats.pending} tone="amber" active={status === 'pending'} onClick={() => { setStatus('pending'); setPage(1); }} />
        <StatCard label="已退款" value={stats.refunded} tone="emerald" active={status === 'refunded'} onClick={() => { setStatus('refunded'); setPage(1); }} />
        <StatCard label="已驳回" value={stats.rejected} tone="rose" active={status === 'rejected'} onClick={() => { setStatus('rejected'); setPage(1); }} />
        <StatCard label="全部登记" value={stats.all} tone="slate" active={status === 'all'} onClick={() => { setStatus('all'); setPage(1); }} />
      </div>

      <div className="card !p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="field-label" htmlFor="admin-q">
              搜索
            </label>
            <div className="flex gap-2">
              <input
                id="admin-q"
                className="input"
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
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => {
                  setQ(qInput.trim());
                  setPage(1);
                }}
              >
                搜索
              </button>
              {q ? (
                <button
                  type="button"
                  className="btn-ghost shrink-0"
                  onClick={() => {
                    setQ('');
                    setQInput('');
                    setPage(1);
                  }}
                >
                  清空
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="admin-status">
              工单状态
            </label>
            <select
              id="admin-status"
              className="input"
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
              className="input"
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
        </div>

        {selected.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3 py-2">
            <span className="text-sm text-brand-700">已选择 {selected.length} 条</span>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
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
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              onClick={() => {
                if (window.confirm(`确认把选中的 ${selected.length} 条标记为「已驳回」？`)) {
                  patch(selected, 'rejected');
                }
              }}
            >
              批量驳回
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
              onClick={() => setSelected([])}
            >
              取消选择
            </button>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="全选本页"
                    checked={allOnPageSelected}
                    onChange={(e) => {
                      if (!payload) return;
                      setSelected(e.target.checked ? payload.rows.map((r) => r.id) : []);
                    }}
                  />
                </th>
                <th className="px-3 py-3">ID / 登记时间</th>
                <th className="px-3 py-3">订单 / 兑换码</th>
                <th className="px-3 py-3">金额</th>
                <th className="px-3 py-3">联系方式</th>
                <th className="px-3 py-3">原因 / 说明</th>
                <th className="px-3 py-3">收款码</th>
                <th className="px-3 py-3">工单状态</th>
                <th className="px-3 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payload?.rows.map((r) => {
                const meta = STATUS_META[r.status as StatusKey] || STATUS_META.pending;
                return (
                  <tr key={r.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`选择 #${r.id}`}
                        checked={selected.includes(r.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id)
                          )
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                      <div className="font-semibold text-slate-900">#{r.id}</div>
                      <div className="text-xs">{fmt(r.created_at)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-xs font-semibold text-slate-900">{r.order_no}</div>
                      <div className="mt-1 font-mono text-xs text-slate-500">{r.redeem_code}</div>
                      <div className="mt-1 text-xs text-slate-400">兑换码状态：{r.redeem_state}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono font-semibold text-slate-900">¥{r.amount}</td>
                    <td className="px-3 py-3 text-slate-700">
                      <div className="text-xs text-slate-400">
                        {CONTACT_TYPE_LABEL[r.contact_type] || r.contact_type}
                      </div>
                      <div className="font-mono text-xs">{r.contact}</div>
                      {r.contact_name ? (
                        <div className="mt-0.5 text-xs text-slate-500">姓名：{r.contact_name}</div>
                      ) : null}
                    </td>
                    <td className="max-w-[240px] px-3 py-3">
                      <div className="text-xs font-medium text-slate-700">
                        {REASON_LABEL[r.reason_code as keyof typeof REASON_LABEL] || r.reason_code}
                      </div>
                      {r.description ? (
                        <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{r.description}</div>
                      ) : null}
                      {r.admin_note ? (
                        <div className="mt-1 rounded bg-slate-100 px-1.5 py-1 text-xs text-slate-600">
                          备注：{r.admin_note}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {r.has_receipt ? (
                        <button type="button" onClick={() => setDetail(r)} className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/admin/receipts/${r.id}`}
                            alt={`收款码 ${r.id}`}
                            className="h-16 w-16 rounded border border-slate-200 object-cover"
                          />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">无</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`badge ${meta.cls}`}>{meta.label}</span>
                      {r.refunded_at ? (
                        <div className="mt-1 text-xs text-slate-400">{fmt(r.refunded_at)}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        <button type="button" className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => setDetail(r)}>
                          核实详情
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          onClick={() => {
                            if (window.confirm(`确认 #${r.id} 已打款并标记为「已退款」？`)) {
                              patch([r.id], 'refunded');
                            }
                          }}
                        >
                          标记已退款
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          onClick={() => copyRow(r)}
                        >
                          复制信息
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && payload && payload.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-16 text-center text-sm text-slate-400">
                    当前筛选条件下没有记录
                  </td>
                </tr>
              ) : null}
              {loading && !payload ? (
                <tr>
                  <td colSpan={9} className="px-3 py-16 text-center text-sm text-slate-400">
                    加载中…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="text-slate-500">
            共 {payload?.total ?? 0} 条 · 第 {payload?.page ?? 1}/{totalPages} 页
            {status === 'pending' ? <span className="ml-2 text-amber-600">本页待退合计 ¥{pendingAmount}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost !px-3 !py-1.5 !text-xs"
              disabled={(payload?.page ?? 1) <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <button
              type="button"
              className="btn-ghost !px-3 !py-1.5 !text-xs"
              disabled={(payload?.page ?? 1) >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {detail ? (
        <DetailModal
          row={detail}
          onClose={() => setDetail(null)}
          onPatch={patch}
          onDelete={removeRow}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  active,
  onClick
}: {
  label: string;
  value: number;
  tone: 'amber' | 'emerald' | 'rose' | 'slate';
  active: boolean;
  onClick: () => void;
}) {
  const tones: Record<string, string> = {
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
    slate: 'text-slate-700'
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition hover:border-brand-300 ${
        active ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200'
      }`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</div>
    </button>
  );
}

function DetailModal({
  row,
  onClose,
  onPatch,
  onDelete
}: {
  row: Row;
  onClose: () => void;
  onPatch: (ids: number[], next: StatusKey, note?: string, ref?: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [note, setNote] = useState(row.admin_note || '');
  const [ref, setRef] = useState(row.refund_ref || '');
  const [busy, setBusy] = useState(false);

  async function act(next: StatusKey) {
    setBusy(true);
    try {
      await onPatch([row.id], next, note, ref);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-3xl rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold text-slate-900">
            退款核实 · #{row.id}
            <span className={`badge ml-2 ${STATUS_META[row.status as StatusKey].cls}`}>
              {STATUS_META[row.status as StatusKey].label}
            </span>
          </h2>
          <button type="button" className="text-slate-400 hover:text-slate-600" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="grid gap-5 px-5 py-4 sm:grid-cols-2">
          <div className="space-y-2 text-sm">
            <KV k="订单号" v={row.order_no} mono />
            <KV k="兑换码" v={row.redeem_code} mono />
            <KV k="退款金额" v={`¥${row.amount}`} mono />
            <KV k="兑换码状态" v={row.redeem_state} />
            <KV k="退款原因" v={REASON_LABEL[row.reason_code as keyof typeof REASON_LABEL] || row.reason_code} />
            <KV k="联系方式" v={`${CONTACT_TYPE_LABEL[row.contact_type] || row.contact_type}：${row.contact}`} />
            {row.contact_name ? <KV k="收款姓名/昵称" v={row.contact_name} /> : null}
            <KV k="登记时间" v={fmt(row.created_at)} />
            <KV k="提交 IP" v={row.ip || '-'} />
            {row.refunded_at ? <KV k="打款时间" v={fmt(row.refunded_at)} /> : null}
            {row.description ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-700">用户说明</div>
                <div className="mt-1 whitespace-pre-wrap">{row.description}</div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">收款码（点击可在新窗口放大）</div>
              {row.has_receipt ? (
                <a href={`/api/admin/receipts/${row.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/receipts/${row.id}`}
                    alt={`收款码 ${row.id}`}
                    className="w-full max-w-[280px] rounded-xl border border-slate-200 bg-white object-contain"
                  />
                </a>
              ) : (
                <p className="text-sm text-slate-400">无收款码</p>
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="modal-note">
                处理备注（可选，用户在查询页可见）
              </label>
              <textarea
                id="modal-note"
                className="input min-h-[64px] resize-y text-sm"
                maxLength={300}
                placeholder="例如：已核实认证失败，2026-10-09 通过微信转账退款"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="modal-ref">
                退款凭证号 / 流水号（可选）
              </label>
              <input
                id="modal-ref"
                className="input text-sm"
                placeholder="如微信转账单号"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-rose-600"
            onClick={() => onDelete(row.id)}
          >
            删除这条记录
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
              disabled={busy}
              onClick={() => act('rejected')}
            >
              驳回
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              disabled={busy}
              onClick={() => act('refunded')}
            >
              {busy ? '提交中…' : '确认已退款'}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600"
              disabled={busy}
              onClick={() => act('pending')}
            >
              重置为待退款
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-200 pb-1.5">
      <span className="shrink-0 text-xs text-slate-500">{k}</span>
      <span className={`text-right text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  );
}
