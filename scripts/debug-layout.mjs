/**
 * 针对 visual-check 报出的疑点做定点排查：
 *  1) 后台表格外层容器在移动端的真实尺寸与滚动能力
 *  2) 金额快捷按钮 / 订单号按钮的真实盒子尺寸（触控目标）
 */
import { chromium } from 'playwright';

const BASE = process.env.CHECK_BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const browser = await chromium.launch();

// ---- 移动端后台表格 ----
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/admin', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  const info = await page.evaluate(() => {
    const wrappers = [...document.querySelectorAll('.overflow-x-auto')];
    const tables = [...document.querySelectorAll('table')];
    const card = document.querySelector('.card.mt-4');
    return {
      wrapperCount: wrappers.length,
      wrapper: wrappers.map((w) => {
        const r = w.getBoundingClientRect();
        const cs = getComputedStyle(w);
        return {
          tag: w.tagName,
          cls: w.className.slice(0, 60),
          rectW: Math.round(r.width),
          scrollW: w.scrollWidth,
          overflowX: cs.overflowX,
          children: [...w.children].map((c) => c.tagName)
        };
      }),
      table: tables.map((t) => {
        const r = t.getBoundingClientRect();
        return { rectW: Math.round(r.width), scrollW: t.scrollWidth, minW: getComputedStyle(t).minWidth };
      }),
      cardRect: card ? Math.round(card.getBoundingClientRect().width) : null,
      rowCount: document.querySelectorAll('tbody tr').length,
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth
    };
  });
  console.log('【移动端后台】', JSON.stringify(info, null, 2));
  await ctx.close();
}

// ---- 金额按钮尺寸 ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const btns = await page.evaluate(() => {
    return [...document.querySelectorAll('button')]
      .map((b) => {
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return {
          text: (b.textContent || '').trim().slice(0, 14),
          w: Math.round(r.width),
          h: Math.round(r.height),
          display: cs.display,
          py: cs.paddingTop,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight
        };
      })
      .filter((b) => b.w > 0);
  });
  console.log('\n【登记页按钮盒子】');
  for (const b of btns) console.log(' ', JSON.stringify(b));
  await ctx.close();
}

await browser.close();
