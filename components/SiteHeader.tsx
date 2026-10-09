'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * 顶部导航。滚动时收紧高度并加阴影，移动端横向可滑。
 */
export default function SiteHeader({ siteName }: { siteName: string }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isAdmin = pathname?.startsWith('/admin');

  const links = [
    { href: '/', label: '提交登记' },
    { href: '/query', label: '查询进度' }
  ];

  return (
    <header
      className={`sticky top-0 z-30 border-b transition-all duration-200 ${
        scrolled
          ? 'border-ink-200/80 bg-white/85 shadow-[0_1px_12px_-6px_rgba(27,31,42,0.25)] backdrop-blur-md'
          : 'border-transparent bg-white/60 backdrop-blur'
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link href="/" className="group flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-[0_4px_12px_-4px_rgba(29,69,216,0.6)] transition group-hover:scale-105">
            退
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink-900 sm:text-[15px]">
              {siteName}
            </span>
            <span className="hidden text-[11px] text-ink-400 sm:block">链动小铺 · 人工核实退款</span>
          </span>
        </Link>

        <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto">
          {!isAdmin
            ? links.map((l) => {
                const active = l.href === '/' ? pathname === '/' : pathname?.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })
            : null}
          {isAdmin ? (
            <span className="whitespace-nowrap rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-600">
              管理后台
            </span>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
