import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid place-items-center px-6 py-24 text-center">
      <div className="max-w-sm animate-fade-up">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-ink-100 text-3xl">🔍</span>
        <h1 className="mt-4 text-xl font-bold text-ink-900">页面不存在</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          请检查链接是否输入正确。如果你是通过店铺公告进来的，可能是链接被截断了。
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/" className="btn-primary">
            去退款登记
          </Link>
          <Link href="/query" className="btn-ghost">
            查询退款进度
          </Link>
        </div>
      </div>
    </main>
  );
}
