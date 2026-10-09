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
  // 收款码属于敏感页面，不希望对搜索引擎开放
  robots: { index: false, follow: false }
};

/**
 * 移动端适配参数。
 * 特意允许用户缩放（maximumScale 不设限制）：部分安卓浏览器与微信内置浏览器
 * 对「禁止缩放」的页面会强制按桌面视口渲染，导致整页被缩小成一条、看起来像空白。
 * 允许缩放 + 自适应宽度，是手机端最稳的组合。
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  themeColor: '#2559eb'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const siteName = siteNameFromEnv();

  return (
    <html lang="zh-CN">
      <body className="min-h-screen overflow-x-hidden bg-ink-50 text-ink-900 antialiased">
        <div className="flex min-h-screen flex-col">
          <SiteHeader siteName={siteName} />
          <div className="min-w-0 flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
