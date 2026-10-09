/**
 * 检查线上/本地 CSS 包里是否真的包含自定义设计类，
 * 防止出现「本地正常、线上被 purge 掉」的样式裸奔。
 *
 * 用法：node scripts/check-css.mjs [base]
 */
const BASE = process.argv[2] || process.env.CHECK_BASE || 'http://127.0.0.1:3000';

const PROBES = [
  'bg-ink-50',
  'text-ink-900',
  'from-brand-500',
  'to-brand-700',
  'form-with-sticky-bar',
  'stat-card',
  'animate-pop-in',
  'animate-fade-up',
  'shadow-card',
  'accent-brand-600',
  'divider-dashed',
  'skeleton'
];

const html = await (await fetch(`${BASE}/`)).text();
const cssPath = /href="(\/_next\/static\/css\/[^"]+\.css)"/.exec(html)?.[1];
if (!cssPath) {
  console.error('❌ 页面里找不到 CSS 链接');
  process.exit(1);
}
const css = await (await fetch(`${BASE}${cssPath}`)).text();

const missing = PROBES.filter((p) => !css.includes(p));
const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] || '';
const header = /sm:text-\[15px\]">([^<]*)</.exec(html)?.[1] || '';

console.log(`CSS: ${cssPath} · ${css.length} 字节`);
console.log(`自定义类缺失: ${missing.length ? missing.join(', ') : '无'}`);
console.log(`页面标题: ${title}`);
console.log(`页头站名: ${header || '(未匹配)'}`);

const ok = missing.length === 0 && !title.includes('??????') && header.trim().length > 0;
console.log(`\n${ok ? '✅ 样式与站名检查通过' : '❌ 检查未通过'}\n`);
process.exit(ok ? 0 : 1);
