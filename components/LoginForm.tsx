'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginForm({ usingDefaultPassword }: { usingDefaultPassword: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(data?.errors?.[0] || '登录失败');
        return;
      }
      router.replace('/admin');
      router.refresh();
    } catch {
      setError('网络异常，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm animate-fade-up">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-br from-ink-800 to-ink-900 px-6 py-7 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-white shadow-lg">
            退
          </span>
          <h1 className="mt-3 text-lg font-bold text-white">退款核实后台</h1>
          <p className="mt-1 text-xs text-ink-300">仅管理员可访问 · 请勿分享此地址</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-6 py-6">
          {usingDefaultPassword ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
              ⚠️ 尚未配置 <code className="font-mono">ADMIN_PASSWORD</code>，正在使用默认密码
              <code className="mx-1 font-mono font-bold">admin123</code>，请尽快改成自己的密码。
            </p>
          ) : null}

          <div>
            <label className="field-label" htmlFor="password">
              管理密码
            </label>
            <div className="relative">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                className="input pr-16"
                autoComplete="current-password"
                placeholder="请输入管理密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
              >
                {show ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          {error ? (
            <p className="animate-pop-in rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full py-3" disabled={busy || !password}>
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                登录中…
              </>
            ) : (
              '登录'
            )}
          </button>

          <p className="text-center text-xs text-ink-400">
            连续输错 8 次将锁定 10 分钟 ·
            <Link href="/" className="ml-1 text-brand-600 hover:underline">
              返回登记页
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
