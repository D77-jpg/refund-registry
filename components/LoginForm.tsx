'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

export default function LoginForm({ usingDefaultPassword }: { usingDefaultPassword: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
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
    <div className="mx-auto max-w-sm">
      <form onSubmit={onSubmit} className="card">
        <h1 className="text-lg font-bold text-slate-900">退款核实后台</h1>
        <p className="mt-1 text-sm text-slate-500">请输入管理密码进入。</p>

        {usingDefaultPassword ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            ⚠️ 当前还没有配置 <code className="font-mono">ADMIN_PASSWORD</code> 环境变量，正在使用默认密码
            <code className="mx-1 font-mono font-bold">admin123</code>，请尽快在部署平台改成自己的密码。
          </p>
        ) : null}

        <div className="mt-4">
          <label className="field-label" htmlFor="password">
            管理密码
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn-primary mt-4 w-full" disabled={busy || !password}>
          {busy ? '登录中…' : '登录'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          <Link href="/" className="underline">
            返回登记页
          </Link>
        </p>
      </form>
    </div>
  );
}
