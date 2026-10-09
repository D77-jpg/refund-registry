'use client';

import Link from 'next/link';
import { useState } from 'react';
import { STATUS_META, type StatusKey } from './labels';

interface LookupData {
  order_no: string;
  redeem_code: string;
  contact: string;
  amount: string;
  status: string;
  status_label: string;
  redeem_state_label: string;
  admin_note: string;
  created_at: string;
  updated_at: string;
  refunded_at: string | null;
}

function fmt(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

/** 三步进度：已登记 → 核实中 → 已打款 */
function Timeline({ status }: { status: string }) {
  const step = status === 'refunded' ? 2 : status === 'rejected' ? 1 : 0;
  const items = [
    { t: '已登记', d: '信息已收到' },
    { t: status === 'rejected' ? '已驳回' : '核实中', d: status === 'rejected' ? '不符合退款条件' : '人工核对订单' },
    { t: '已打款', d: '按收款码转账' }
  ];
  const rejected = status === 'rejected';

  return (
    <div className="flex items-start">
      {items.map((s, i) => {
        const done = i <= step;
        const isLast = i === items.length - 1;
        const isRejectStep = rejected && i === 1;
        return (
          <div key={s.t} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : done ? 'bg-brand-400' : 'bg-ink-200'}`} />
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  isRejectStep
                    ? 'bg-rose-100 text-rose-700'
                    : done
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink-100 text-ink-400'
                }`}
              >
                {isRejectStep ? '✕' : done ? '✓' : i + 1}
              </span>
              <span
                className={`h-0.5 flex-1 ${
                  isLast ? 'bg-transparent' : i < step ? 'bg-brand-400' : 'bg-ink-200'
                }`}
              />
            </div>
            <span className={`mt-2 text-xs font-medium ${done ? 'text-ink-800' : 'text-ink-400'}`}>{s.t}</span>
            <span className="text-[11px] text-ink-400">{s.d}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function QueryForm() {
  const [orderNo, setOrderNo] = useState('');
  const [tail, setTail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<LookupData | null>(null);

  async function onQuery(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setData(null);
    if (!orderNo.trim() || !tail.trim()) {
      setError('请填写订单号和联系方式后 4 位');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/refunds/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_no: orderNo, contact_tail: tail })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.errors?.[0] || '查询失败，请稍后重试');
        return;
      }
      setData(json.data as LookupData);
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  const meta = data ? STATUS_META[data.status as StatusKey] : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card card-pad animate-fade-up">
        <div className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl text-white shadow-[0_8px_20px_-8px_rgba(29,69,216,0.7)] sm:grid">
            🔎
          </span>
          <div>
            <h1 className="text-lg font-bold text-ink-900 sm:text-xl">查询退款进度</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              输入登记时的订单号，以及联系方式的后 4 位，即可查看当前处理状态。
            </p>
          </div>
        </div>

        <form onSubmit={onQuery} className="mt-5 space-y-4">
          <div>
            <label className="field-label" htmlFor="q-order">
              订单号
            </label>
            <input
              id="q-order"
              className="input font-mono tracking-wide"
              placeholder="LD261008YXAAH0"
              autoComplete="off"
              spellCheck={false}
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="q-tail">
              联系方式后 4 位
            </label>
            <input
              id="q-tail"
              className="input"
              placeholder="微信号 / QQ / 手机号的最后 4 位"
              autoComplete="off"
              value={tail}
              onChange={(e) => setTail(e.target.value)}
            />
            <p className="field-hint">例如微信号 yjespig，就填 spig。</p>
          </div>

          {error ? (
            <p className="animate-pop-in rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                查询中…
              </>
            ) : (
              '查询'
            )}
          </button>
        </form>
      </div>

      {data ? (
        <div className="card animate-fade-up overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
            <div>
              <h2 className="font-mono text-sm font-semibold text-ink-900">{data.order_no}</h2>
              <p className="mt-0.5 text-xs text-ink-400">登记于 {fmt(data.created_at)}</p>
            </div>
            {meta ? (
              <span className={`badge ${meta.cls}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            ) : null}
          </div>

          <div className="border-b border-ink-100 px-5 py-5">
            <Timeline status={data.status} />
          </div>

          <div className="grid gap-x-6 gap-y-3 px-5 py-5 sm:grid-cols-2">
            <Row label="兑换码" value={data.redeem_code} mono />
            <Row label="退款金额" value={`¥${data.amount}`} mono />
            <Row label="联系方式" value={data.contact} />
            <Row label="兑换码状态" value={data.redeem_state_label} />
            <Row label="最近更新" value={fmt(data.updated_at)} />
            {data.refunded_at ? <Row label="打款时间" value={fmt(data.refunded_at)} /> : null}
          </div>

          {data.admin_note ? (
            <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-4">
              <p className="text-xs font-semibold text-ink-600">处理备注</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{data.admin_note}</p>
            </div>
          ) : null}

          <div className="border-t border-ink-100 bg-amber-50/60 px-5 py-3.5">
            <p className="text-xs leading-relaxed text-amber-800">
              核实与打款按登记顺序进行。若状态长时间停留在「待人工退款」，请通过店铺客服渠道联系，
              不要重复提交（重复提交会被系统拦截）。
            </p>
          </div>
        </div>
      ) : null}

      <div className="text-center">
        <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
          还没有登记？去提交退款登记 →
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 divider-dashed pb-2">
      <dt className="shrink-0 text-xs text-ink-400">{label}</dt>
      <dd className={`truncate text-right text-sm font-medium text-ink-900 ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
