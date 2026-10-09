import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-ink-200/70 bg-white/70">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 text-xs leading-relaxed text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">
            本页面仅用于收集退款信息，核实后由人工统一打款。
            <span className="font-medium text-ink-500">
              我们不会向任何人索取短信验证码、支付密码或银行卡密码。
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden sm:inline">请勿重复提交</span>
            <Link
              href="/admin"
              className="rounded-md px-2 py-1 text-ink-300 transition hover:bg-ink-100 hover:text-ink-500"
            >
              管理入口
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
