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
  { value: 'wechat', label: '微信号', icon: '💬' },
  { value: 'qq', label: 'QQ 号', icon: '🐧' },
  { value: 'phone', label: '手机号', icon: '📱' },
  { value: 'other', label: '其他', icon: '🔗' }
];

/** 对应链动小铺后台的两种实付价格 */
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
  const [receipt, setReceipt] = useState<{ dataUrl: string; bytes: number; url?: string } | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ order_no: string; created_at: string } | null>(null);
  const honeyRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  /** 表单完成度：顶部进度条 + 提交按钮文案共用同一套判定 */
  const { progress, remaining } = useMemo(() => {
    const checks = [
      /^LD[0-9A-Z]{8,24}$/.test(form.order_no.replace(/\s/g, '').toUpperCase()),
      /^[0-9A-Z]{12}$/.test(form.redeem_code.replace(/[\s-]/g, '').toUpperCase()),
      form.amount.trim() !== '' && Number(form.amount) > 0,
      form.reason_code !== '',
      form.redeem_state !== '',
      form.contact.trim().length >= 4,
      receipt !== null
    ];
    const passed = checks.filter(Boolean).length;
    return {
      progress: Math.round((passed / checks.length) * 100),
      remaining: checks.length - passed
    };
  }, [form, receipt]);

  const canSubmit = remaining === 0 && !submitting && !receiptBusy;

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setErrors([]);
    setReceiptBusy(true);
    setUploadNote('正在压缩图片…');
    try {
      const res = await compressImage(file);
      setReceipt({ dataUrl: res.dataUrl, bytes: res.bytes });

      // 压缩后直接传到对象存储，避免把大段 base64 塞进提交请求；失败则退回随表单提交
      setUploadNote('正在上传收款码…');
      try {
        const blob = await (await fetch(res.dataUrl)).blob();
        const fd = new FormData();
        fd.append('file', blob, 'receipt.jpg');
        const up = await fetch('/api/refunds/receipt', { method: 'POST', body: fd });
        const upJson = await up.json().catch(() => null);
        if (up.ok && upJson?.ok && upJson.data?.url) {
          setReceipt({ dataUrl: res.dataUrl, bytes: res.bytes, url: upJson.data.url });
          setUploadNote(`已上传 · ${humanSize(res.bytes)}`);
        } else {
          setUploadNote(`待提交 · ${humanSize(res.bytes)}`);
        }
      } catch {
        setUploadNote(`待提交 · ${humanSize(res.bytes)}`);
      }
    } catch (err: any) {
      setErrors([err?.message || '图片处理失败，请重新选择']);
      setReceipt(null);
      setUploadNote('');
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
    if (!/^[0-9A-Z]{12}$/.test(code.replace(/-/g, ''))) {
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
          receipt_url: receipt!.url || '',
          receipt: receipt!.url ? '' : receipt!.dataUrl,
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
      setUploadNote('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setErrors(['网络异常，提交失败。请检查网络后重试。']);
    } finally {
      setSubmitting(false);
    }
  }

  /* ------------------------------ 成功页 ------------------------------ */
  if (done) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-up">
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 px-6 py-8 text-center text-white">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/20 text-3xl backdrop-blur">
              ✓
            </div>
            <h1 className="mt-4 text-xl font-bold sm:text-2xl">登记成功，请等待核实打款</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-emerald-50">
              我们会逐单核对订单与兑换码状态，核实通过后按你上传的收款码打款。
            </p>
          </div>

          <div className="card-section">
            <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3">
              <span className="text-xs text-ink-500">已登记的订单号</span>
              <span className="font-mono text-sm font-semibold text-ink-900">{done.order_no}</span>
            </div>

            <ol className="mt-5 space-y-3">
              {[
                { t: '信息已记录', d: '系统已收到你的登记，按登记顺序排队。', on: true },
                { t: '人工核实中', d: '核对订单号、金额与兑换码状态是否可退。', on: false },
                { t: '打款到账', d: '核实通过后按收款码转账，状态会同步到查询页。', on: false }
              ].map((s, i) => (
                <li key={s.t} className="flex gap-3">
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      s.on ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-400'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${s.on ? 'text-ink-900' : 'text-ink-600'}`}>{s.t}</p>
                    <p className="text-xs leading-relaxed text-ink-400">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="border-t border-amber-100 bg-amber-50/70 px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold text-amber-800">接下来请注意</p>
            <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-amber-800/90">
              <li>· 同一订单号只能登记一次，重复提交会被系统拦截。</li>
              <li>· 不要修改或注销兑换码，否则无法核对；已停用的兑换码无需再操作。</li>
              <li>· 退款按登记顺序处理，高峰期需要等待，请耐心等待到账。</li>
              {supportContact ? <li>· 长时间未收到，请联系客服：{supportContact}</li> : null}
            </ul>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/query" className="btn-primary">
            查询我的退款进度
          </Link>
          <button type="button" className="btn-ghost" onClick={() => setDone(null)}>
            再登记一单
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------ 表单 ------------------------------ */
  return (
    <form onSubmit={onSubmit} className="form-with-sticky-bar mx-auto max-w-2xl space-y-4">
      {/* 顶部说明 */}
      <div className="card card-pad animate-fade-up">
        <div className="flex items-start gap-4">
          <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl text-white shadow-[0_8px_20px_-8px_rgba(29,69,216,0.7)] sm:grid">
            📝
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-ink-900 sm:text-xl">{siteName}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              因系统原因需为部分卡密订单办理退款。请如实填写下列信息，我们会逐单核对后<strong className="font-semibold text-ink-700">人工打款</strong>。
              带 <span className="text-rose-500">*</span> 为必填项。
            </p>
          </div>
        </div>

        {deadlineNote ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/70 px-3.5 py-2.5">
            <span className="text-sm">⏰</span>
            <p className="text-xs font-medium leading-relaxed text-rose-700">{deadlineNote}</p>
          </div>
        ) : null}

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5">
          <span className="text-sm">🔒</span>
          <p className="text-xs leading-relaxed text-ink-500">
            本页面绝不会索要短信验证码、支付密码或银行卡密码。任何人以此为由索要，都是骗子。
          </p>
        </div>

        {/* 完成度 */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-500">填写完成度</span>
            <span className={`font-semibold ${progress === 100 ? 'text-emerald-600' : 'text-brand-600'}`}>
              {progress}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progress === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand-400 to-brand-600'
              }`}
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="animate-pop-in rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-700">
            <span>⚠️</span> 请修正以下 {errors.length} 个问题
          </p>
          <ul className="mt-2 space-y-1 pl-6 text-sm leading-relaxed text-rose-600">
            {errors.map((e, i) => (
              <li key={i} className="list-disc">
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 第 1 步：订单信息 */}
      <section className="card animate-fade-up">
        <header className="flex items-center gap-3 border-b border-ink-100 px-5 py-4 sm:px-6">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white">
            1
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink-900">订单与卡密</h2>
            <p className="text-xs text-ink-400">在链动小铺「我的订单」里可以复制到</p>
          </div>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div>
            <label className="field-label" htmlFor="order_no">
              链动小铺订单号 <span className="text-rose-500">*</span>
            </label>
            <input
              id="order_no"
              className="input font-mono tracking-wide"
              placeholder="LD261008YXAAH0"
              autoComplete="off"
              spellCheck={false}
              value={form.order_no}
              onChange={(e) => set('order_no', e.target.value.toUpperCase())}
            />
            <p className="field-hint">以 LD 开头的一串字母数字，是本次核对的主要依据。</p>
          </div>

          <div>
            <label className="field-label" htmlFor="redeem_code">
              卡密 / 兑换码 <span className="text-rose-500">*</span>
            </label>
            <input
              id="redeem_code"
              className="input font-mono tracking-wide"
              placeholder="9H6R-APN8-7URB"
              autoComplete="off"
              spellCheck={false}
              value={form.redeem_code}
              onChange={(e) => set('redeem_code', e.target.value.toUpperCase())}
            />
            <p className="field-hint">12 位字符。不填横杠也可以，系统会自动补全。</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="amount">
                退款金额（元） <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                  ¥
                </span>
                <input
                  id="amount"
                  className="input pl-7 font-mono"
                  placeholder="96"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value.replace(/[^\d.]/g, ''))}
                />
              </div>
              <div className="mt-2 flex gap-2">
                {AMOUNT_PRESETS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set('amount', a)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                      form.amount === a
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-ink-200 text-ink-500 hover:border-ink-300 hover:bg-ink-50'
                    }`}
                  >
                    ¥{a}
                  </button>
                ))}
              </div>
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
              <p className="field-hint">对应兑换页面上的显示状态，不确定就选「不清楚」。</p>
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
              补充说明
              {form.reason_code === 'other' ? (
                <span className="text-rose-500">*</span>
              ) : (
                <span className="font-normal text-ink-400">（选填）</span>
              )}
            </label>
            <textarea
              id="description"
              className="input min-h-[84px] resize-y leading-relaxed"
              maxLength={500}
              placeholder="例如：兑换时提示「无法正常获取学生认证」，重试多次仍失败。"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
            <p className="field-hint">{form.description.length}/500 字。描述越清楚，核实越快。</p>
          </div>
        </div>
      </section>

      {/* 第 2 步：收款与联系 */}
      <section className="card animate-fade-up">
        <header className="flex items-center gap-3 border-b border-ink-100 px-5 py-4 sm:px-6">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white">
            2
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink-900">收款方式与联系方式</h2>
            <p className="text-xs text-ink-400">用于核对订单与打款，仅管理员可见</p>
          </div>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div>
            <span className="field-label">联系方式类型</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CONTACT_TYPES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set('contact_type', c.value)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                    form.contact_type === c.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-100'
                      : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50'
                  }`}
                >
                  <span>{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="contact">
                联系方式 <span className="text-rose-500">*</span>
              </label>
              <input
                id="contact"
                className="input"
                placeholder={form.contact_type === 'phone' ? '13800000000' : '你的账号'}
                autoComplete="off"
                value={form.contact}
                onChange={(e) => set('contact', e.target.value)}
              />
              <p className="field-hint">请填能联系上的账号，查询进度时会用到后 4 位。</p>
            </div>
            <div>
              <label className="field-label" htmlFor="contact_name">
                收款账号姓名 / 昵称 <span className="font-normal text-ink-400">（选填）</span>
              </label>
              <input
                id="contact_name"
                className="input"
                placeholder="收款码上显示的昵称"
                autoComplete="off"
                value={form.contact_name}
                onChange={(e) => set('contact_name', e.target.value)}
              />
              <p className="field-hint">填了能加快核对速度。</p>
            </div>
          </div>

          <div>
            <span className="field-label">
              收款码截图（微信 / 支付宝） <span className="text-rose-500">*</span>
            </span>

            {receipt ? (
              <div className="flex flex-col gap-4 rounded-2xl border border-ink-200 bg-ink-50/60 p-4 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receipt.dataUrl}
                  alt="收款码预览"
                  className="mx-auto h-40 w-40 rounded-xl border border-ink-200 bg-white object-contain shadow-sm sm:mx-0"
                />
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <span>✓</span> {uploadNote || `待提交 · ${humanSize(receipt.bytes)}`}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-ink-400">
                    请确认二维码清晰可扫、没有被裁剪。核实通过后我们会按这张图打款。
                  </p>
                  <div className="mt-3 flex justify-center gap-2 sm:justify-start">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => {
                        setReceipt(null);
                        setUploadNote('');
                        fileRef.current?.click();
                      }}
                    >
                      重新选择
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setReceipt(null)}
                    >
                      移除
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={receiptBusy}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  onPickFile(e.dataTransfer.files?.[0]);
                }}
                className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 transition ${
                  dragging
                    ? 'border-brand-400 bg-brand-50/70'
                    : 'border-ink-300 bg-ink-50/50 hover:border-brand-400 hover:bg-brand-50/40'
                }`}
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-2xl shadow-sm">
                  {receiptBusy ? '⏳' : '🧾'}
                </span>
                <span className="text-sm font-medium text-ink-700">
                  {receiptBusy ? '正在处理图片…' : '点击上传收款码截图'}
                </span>
                <span className="text-xs text-ink-400">支持拖拽 · png / jpg / webp · 自动压缩</span>
              </button>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
            <p className="field-hint">
              在微信/支付宝「收付款 → 收款码」里截图即可。图片仅用于本次打款，只有管理员能看到。
            </p>
          </div>
        </div>
      </section>

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

      {/* 提交 */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-ink-200/80 bg-white/90 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:rounded-2xl sm:border sm:border-ink-200/80 sm:px-5 sm:py-4 sm:shadow-card">
        <button type="submit" className="btn-primary w-full py-3" disabled={!canSubmit}>
          {submitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              正在提交…
            </>
          ) : canSubmit ? (
            '提交退款登记'
          ) : (
            `还差 ${remaining} 项，完成后即可提交`
          )}
        </button>
        <p className="mt-2.5 text-center text-xs text-ink-400">
          提交后可用订单号在
          <Link href="/query" className="mx-1 font-medium text-brand-600 hover:underline">
            查询进度
          </Link>
          页面查看状态
        </p>
      </div>
    </form>
  );
}
