import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || '卡密退款登记';

export const metadata: Metadata = {
  title: `${siteName} | 链动小铺订单退款`,
  description: '链动小铺卡密订单退款信息登记与进度查询，人工核实后统一打款。',
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1c56e8'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
              <Link href="/" className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                  退
                </span>
                <span className="text-sm font-semibold text-slate-800 sm:text-base">{siteName}</span>
              </Link>
              <nav className="flex items-center gap-3 text-sm">
                <Link href="/" className="text-slate-600 hover:text-brand-600">
                  提交登记
                </Link>
                <Link href="/query" className="text-slate-600 hover:text-brand-600">
                  查询进度
                </Link>
              </nav>
            </div>
          </header>

          <div className="flex-1">{children}</div>

          <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-xs leading-relaxed text-slate-400">
            <p>本页面仅用于收集退款信息，核实后由人工统一打款，不会向任何人索取验证码或银行卡密码。</p>
            <p className="mt-1">
              请勿重复提交；如有疑问请通过你购买时的店铺客服渠道联系。
              <Link href="/admin" className="ml-2 text-slate-300 hover:text-slate-500">
                管理入口
              </Link>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
