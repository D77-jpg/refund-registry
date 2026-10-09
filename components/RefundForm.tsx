'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { REASON_LABEL, REDEEM_STATE_LABEL, type ReasonCode, type RedeemState } from '@/components/labels';
import { compressImage, humanSize } from '@/lib/image';

interface FormState {
  order_no: string;
  redeem_code: string;
  contact_type: string;
  contact: string;
  contact_name: string;
  amount: string;
  reason_code: string;
  redeem_state: string;
  description: string;
}

const INITIAL: FormState = {
  order_no: '',
  redeem_code: '',
  contact_type: 'wechat',
  contact: '',
  contact_name: '',
  amount: '',
  reason_code: '',
  redeem_state: '',
  description: ''
};

const CONTACT_TYPES = [
  { value: 'wechat', label: '微信号' },
  { value: 'qq', label: 'QQ 号' },
  { value: 'phone', label: '手机号' },
  { value: 'other', label: '其他' }
];

/** 商品价格快捷选项，对应链动小铺后台的 96 / 133.9 */
const AMOUNT_PRESETS = ['96', '133.9'];

export default function RefundForm({
  siteName,
  deadlineNote,
  supportContact
}: {
  siteName: string;
  deadlineNote: string;
  supportContact: string;
}) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [receipt, setReceipt] = useState<{ dataUrl: string; bytes: number } | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ order_no: string; created_at: string } | null>(null);
  const honeyRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const canSubmit = useMemo(() => {
    return (
      form.order_no.trim() !== '' &&
      form.redeem_code.trim() !== '' &&
      form.contact.trim() !== '' &&
      form.amount.trim() !== '' &&
      form.reason_code !== '' &&
      form.redeem_state !== '' &&
      receipt !== null &&
      !submitting &&
      !receiptBusy
    );
  }, [form, receipt, submitting, receiptBusy]);

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setErrors([]);
    setReceiptBusy(true);
    try {
      const res = await compressImage(file);
      setReceipt({ dataUrl: res.dataUrl, bytes: res.bytes });
    } catch (err: any) {
      setErrors([err?.message || '图片处理失败，请重新选择']);
      setReceipt(null);
    } finally {
      setReceiptBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);

    const local: string[] = [];
    const orderNo = form.order_no.replace(/\s/g, '').toUpperCase();
    if (!/^LD[0-9A-Z]{8,24}$/.test(orderNo)) {
      local.push('订单号格式不正确，应为 LD 开头（例：LD261008YXAAH0）');
    }
    const code = form.redeem_code.replace(/\s/g, '').toUpperCase();
    const codeCompact = code.replace(/-/g, '');
    if (!/^[0-9A-Z]{12}$/.test(codeCompact)) {
      local.push('卡密 / 兑换码格式不正确，应为 12 位字符（例：9H6R-APN8-7URB）');
    }
    if (!form.contact.trim()) local.push('请填写联系方式');
    const amountNum = Number(form.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0.01 || amountNum > 100000) {
      local.push('退款金额不正确');
    }
    if (!form.reason_code) local.push('请选择退款原因');
    if (form.reason_code === 'other' && form.description.trim().length < 5) {
      local.push('选择「其他原因」时请填写至少 5 个字的说明');
    }
    if (!form.redeem_state) local.push('请选择兑换码当前状态');
    if (!receipt) local.push('请上传收款码截图');
    if (local.length) {
      setErrors(local);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/refunds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          order_no: orderNo,
          redeem_code: code,
          amount: form.amount,
          receipt: receipt!.dataUrl,
          __hp: honeyRef.current?.value || ''
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setErrors(data?.errors?.length ? data.errors : ['提交失败，请稍后重试']);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setDone({ order_no: data.data.order_no, created_at: data.data.created_at });
      setForm(INITIAL);
      setReceipt(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setErrors(['网络异常，提交失败。请检查网络后重试。']);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="card mx-auto max-w-2xl text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-2xl">
          ✅
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">登记成功，请等待核实打款</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          订单号 <span className="font-mono font-semibold text-slate-900">{done.order_no}</span> 已记录。
          <br />
          我们会逐单核对兑换码状态与订单信息，核实通过后按你上传的收款码原路打款。
        </p>
        <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-800">
          <p className="font-semibold">接下来请注意：</p>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>同一订单号只能登记一次，重复提交会被系统拦截。</li>
            <li>不要修改或注销兑换码，否则无法核对；已停用的兑换码不需要你再操作。</li>
            <li>退款按登记顺序处理，高峰期可能需要等待，请耐心等待打款到账。</li>
            {supportContact ? <li>如长时间未收到，请联系客服：{supportContact}</li> : null}
          </ol>
        </div>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/query" className="btn-primary">
            查询我的退款进度
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setDone(null);
            }}
          >
            再登记一单
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-4">
      <div className="card">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{siteName}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          因系统原因需要为部分卡密订单办理退款。请如实填写下面信息，我们会逐单核对后人工打款。
          带 <span className="text-rose-500">*</span> 为必填项。
        </p>
        {deadlineNote ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {deadlineNote}
          </p>
        ) : null}
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
          提醒：本页面绝不会索要你的短信验证码、支付密码或银行卡密码。任何人以此为由索要，都是骗子。
        </p>
      </div>

      {errors.length > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-700">请修正以下问题：</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-rose-600">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="card space-y-5">
        <div>
          <label className="field-label" htmlFor="order_no">
            链动小铺订单号 <span className="text-rose-500">*</span>
          </label>
          <input
            id="order_no"
            className={`input font-mono ${errors.length ? '' : ''}`}
            placeholder="LD261008YXAAH0"
            autoComplete="off"
            value={form.order_no}
            onChange={(e) => set('order_no', e.target.value.toUpperCase())}
            inputMode="text"
          />
          <p className="field-hint">
            在链动小铺「我的订单」里复制，格式为 LD 开头的一串字母数字（如图：LD261008YXAAH0）。
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="redeem_code">
            卡密 / 兑换码 <span className="text-rose-500">*</span>
          </label>
          <input
            id="redeem_code"
            className="input font-mono uppercase"
            placeholder="9H6R-APN8-7URB"
            autoComplete="off"
            value={form.redeem_code}
            onChange={(e) => set('redeem_code', e.target.value.toUpperCase())}
          />
          <p className="field-hint">卡密里的 12 位字符，带横杠；不填横杠也可以，系统会自动补全。</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="amount">
              退款金额（元） <span className="text-rose-500">*</span>
            </label>
            <input
              id="amount"
              className="input font-mono"
              placeholder="96"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value.replace(/[^\d.]/g, ''))}
            />
            <div className="mt-2 flex gap-2">
              {AMOUNT_PRESETS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => set('amount', a)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    form.amount === a
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  ¥{a}
                </button>
              ))}
            </div>
            <p className="field-hint">填写订单实付金额，用于核对，最终以订单实际支付金额为准。</p>
          </div>

          <div>
            <label className="field-label" htmlFor="redeem_state">
              兑换码当前状态 <span className="text-rose-500">*</span>
            </label>
            <select
              id="redeem_state"
              className="input"
              value={form.redeem_state}
              onChange={(e) => set('redeem_state', e.target.value)}
            >
              <option value="">请选择</option>
              {(Object.keys(REDEEM_STATE_LABEL) as RedeemState[]).map((k) => (
                <option key={k} value={k}>
                  {REDEEM_STATE_LABEL[k]}
                </option>
              ))}
            </select>
            <p className="field-hint">对应兑换页面显示的状态，不确定就选「不清楚」。</p>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="reason_code">
            退款原因 <span className="text-rose-500">*</span>
          </label>
          <select
            id="reason_code"
            className="input"
            value={form.reason_code}
            onChange={(e) => set('reason_code', e.target.value)}
          >
            <option value="">请选择</option>
            {(Object.keys(REASON_LABEL) as ReasonCode[]).map((k) => (
              <option key={k} value={k}>
                {REASON_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="description">
            补充说明 {form.reason_code === 'other' ? <span className="text-rose-500">*</span> : '(选填)'}
          </label>
          <textarea
            id="description"
            className="input min-h-[80px] resize-y"
            maxLength={500}
            placeholder="例如：兑换时提示「无法正常获取学生认证」，重试多次仍失败。"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
          <p className="field-hint">{form.description.length}/500 字。描述越清楚，核实越快。</p>
        </div>
      </div>

      <div className="card space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="contact_type">
              联系方式类型
            </label>
            <select
              id="contact_type"
              className="input"
              value={form.contact_type}
              onChange={(e) => set('contact_type', e.target.value)}
            >
              {CONTACT_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="contact">
              联系方式 <span className="text-rose-500">*</span>
            </label>
            <input
              id="contact"
              className="input"
              placeholder="微信号 / QQ 号 / 手机号"
              autoComplete="off"
              value={form.contact}
              onChange={(e) => set('contact', e.target.value)}
            />
            <p className="field-hint">用于核对订单与联系你，请填能联系上的账号。</p>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="contact_name">
            收款账号姓名 / 昵称（选填）
          </label>
          <input
            id="contact_name"
            className="input"
            placeholder="例如：张三，或收款码显示的昵称"
            autoComplete="off"
            value={form.contact_name}
            onChange={(e) => set('contact_name', e.target.value)}
          />
        </div>

        <div>
          <label className="field-label">
            收款码截图（微信 / 支付宝） <span className="text-rose-500">*</span>
          </label>
          <div
            className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center transition hover:border-brand-400"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onPickFile(e.dataTransfer.files?.[0]);
            }}
          >
            {receipt ? (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receipt.dataUrl}
                  alt="收款码预览"
                  className="mx-auto max-h-56 rounded-lg border border-slate-200 bg-white object-contain"
                />
                <p className="text-xs text-slate-500">已选择，压缩后 {humanSize(receipt.bytes)}</p>
                <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>
                  重新选择
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-3xl">🧾</div>
                <p className="text-sm text-slate-600">
                  {receiptBusy ? '正在压缩图片…' : '点击选择，或把图片拖到这里'}
                </p>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={receiptBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  {receiptBusy ? '处理中…' : '选择图片'}
                </button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
          </div>
          <p className="field-hint">
            请在微信/支付宝「收付款 → 收款码」里截图上传，只用于本次打款，仅管理员可见。
          </p>
        </div>
      </div>

      {/* 蜜罐字段：正常用户看不到 */}
      <input
        ref={honeyRef}
        type="text"
        name="__hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="card">
        <button type="submit" className="btn-primary w-full" disabled={!canSubmit}>
          {submitting ? '正在提交…' : '提交退款登记'}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">
          提交后可用订单号在
          <Link href="/query" className="mx-1 text-brand-600 underline">
            查询进度
          </Link>
          页面查看处理状态。
        </p>
      </div>
    </form>
  );
}
