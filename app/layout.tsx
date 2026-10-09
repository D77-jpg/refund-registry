import type { Metadata, Viewport } from 'next';
import './globals.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { siteNameFromEnv } from '@/lib/site';

export const metadata: Metadata = {
  title: {
    default: `${siteNameFromEnv()} | 链动小铺订单退款`,
    template: `%s | ${siteNameFromEnv()}`
  },
  description: '链动小铺卡密订单退款信息登记与进度查询，人工核实后统一打款。',
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2559eb'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const siteName = siteNameFromEnv();

  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-ink-50 text-ink-900 antialiased">
        <div className="flex min-h-screen flex-col">
          <SiteHeader siteName={siteName} />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
