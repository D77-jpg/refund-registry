import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl">🔍</div>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">页面不存在</h1>
      <p className="mt-2 text-sm text-slate-500">请检查链接是否输入正确。</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        返回退款登记
      </Link>
    </main>
  );
}
