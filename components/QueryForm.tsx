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
      <div className="card">
        <h1 className="text-xl font-bold text-slate-900">查询退款进度</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          输入登记时填写的订单号，以及联系方式的后 4 位，即可查看当前处理状态。
        </p>
        <form onSubmit={onQuery} className="mt-4 space-y-4">
          <div>
            <label className="field-label" htmlFor="q-order">
              订单号
            </label>
            <input
              id="q-order"
              className="input font-mono"
              placeholder="LD261008YXAAH0"
              autoComplete="off"
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
              placeholder="例如微信号 / QQ / 手机号 的最后 4 位"
              autoComplete="off"
              value={tail}
              onChange={(e) => setTail(e.target.value)}
            />
          </div>
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? '查询中…' : '查询'}
          </button>
        </form>
      </div>

      {data ? (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              订单 <span className="font-mono">{data.order_no}</span>
            </h2>
            {meta ? <span className={`badge ${meta.cls}`}>{meta.label}</span> : null}
          </div>

          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Row label="兑换码" value={data.redeem_code} mono />
            <Row label="联系方式" value={data.contact} />
            <Row label="退款金额" value={`¥${data.amount}`} />
            <Row label="兑换码状态" value={data.redeem_state_label} />
            <Row label="登记时间" value={fmt(data.created_at)} />
            <Row label="最近更新" value={fmt(data.updated_at)} />
            {data.refunded_at ? <Row label="打款时间" value={fmt(data.refunded_at)} /> : null}
          </dl>

          {data.admin_note ? (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold">处理备注</p>
              <p className="mt-1 whitespace-pre-wrap">{data.admin_note}</p>
            </div>
          ) : null}

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            核实与打款按登记顺序进行。若状态长时间停留在「待人工退款」，请通过店铺客服渠道联系，
            不要重复提交（重复提交会被系统拦截）。
          </p>
        </div>
      ) : null}

      <div className="text-center">
        <Link href="/" className="text-sm text-brand-600 underline">
          还没有登记？去提交退款登记
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-200 pb-2">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={`text-right font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
