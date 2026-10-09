/**
 * 站点名称读取。
 *
 * 单独放一个模块，避免在 app/layout.tsx 里导出额外符号（Next.js 的 layout 只允许导出
 * 特定成员，导出别的会报类型错误）。
 *
 * 这里要清洗不可见字符：环境变量在 Windows 下写入时可能带上 UTF-8 BOM，
 * 曾经因此导致线上页头显示成乱码。
 */
export function siteNameFromEnv(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_NAME || '';
  const clean = raw.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  // 环境变量被写坏（例如整串问号）时回落到默认名
  if (!clean || /^\?+$/.test(clean)) return '卡密退款登记';
  return clean;
}

/** 清洗可选的环境变量文案 */
export function cleanEnvText(value: string | undefined): string {
  return (value || '').replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}
