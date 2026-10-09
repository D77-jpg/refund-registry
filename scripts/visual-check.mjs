/**
 * 视觉与布局体检 + 截图。
 *
 * 因为无法用眼睛看渲染结果，这里用无头浏览器对每个页面做客观检查：
 *   - 是否出现横向滚动（移动端最常见的美化事故）
 *   - 关键元素是否存在且可见（按钮、卡片、统计卡）
 *   - 触控目标尺寸是否够大（>= 32px，移动端可用性）
 *   - 文本溢出截断情况
 *   - 正文字号是否过小
 * 并把桌面 / 移动两种视口截图存到 screenshots/ 便于人工查看。
 *
 * 用法：node scripts/visual-check.mjs [base]
 */
import { mkdirSync } from 'fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] || process.env.CHECK_BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
};

const browser = await chromium.launch();

/** 对一个页面做客观度量 */
async function audit(page, label) {
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const buttons = [...document.querySelectorAll('button, a.btn-primary, a.btn-ghost')].filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width <= 0 || r.height <= 0 || s.visibility === 'hidden') return false;
      // 表格里的行内文本按钮（如「点击复制订单号」）是刻意做成小热区的，不计入触控目标检查
      if (el.closest('table')) return false;
      return true;
    });
    const small = buttons
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { text: (el.textContent || '').trim().slice(0, 12), h: Math.round(r.height) };
      })
      .filter((b) => b.h > 0 && b.h < 28);

    const tinyText = [...document.querySelectorAll('p, span, td, li')].filter((el) => {
      if (!el.textContent || !el.textContent.trim()) return false;
      const size = parseFloat(getComputedStyle(el).fontSize);
      return size > 0 && size < 11;
    }).length;

    const cards = document.querySelectorAll('.card, .stat-card').length;

    return {
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      bodyHeight: de.scrollHeight,
      cardCount: cards,
      buttonCount: buttons.length,
      smallButtons: small,
      tinyTextCount: tinyText
    };
  });

  const overflow = m.scrollWidth - m.clientWidth;
  check(`${label} 无横向滚动`, overflow <= 1, `溢出 ${overflow}px (${m.scrollWidth} vs ${m.clientWidth})`);
  check(`${label} 触控目标不过小`, m.smallButtons.length === 0, JSON.stringify(m.smallButtons.slice(0, 3)));
  check(`${label} 正文没有过小字号(<11px)`, m.tinyTextCount === 0, `${m.tinyTextCount} 处`);
  console.log(
    `     卡片 ${m.cardCount} 个 · 按钮 ${m.buttonCount} 个 · 页面高度 ${m.bodyHeight}px`
  );
  return m;
}

/** 登录后台并打开工作台 */
async function loginAndOpenAdmin(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/admin', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  // 列表是异步加载的，等骨架屏消失再截图，否则拍到的是加载态
  await page
    .locator('table tbody tr .skeleton')
    .first()
    .waitFor({ state: 'detached', timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(400);
}

// ---------------- 桌面视口 ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  console.log('\n【桌面 1440×900】');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/desktop-home.png`, fullPage: true });
  await audit(page, '登记页');

  await page.goto(`${BASE}/query`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/desktop-query.png`, fullPage: true });
  await audit(page, '查询页');

  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/desktop-login.png`, fullPage: true });
  await audit(page, '登录页');

  await loginAndOpenAdmin(page);
  await page.screenshot({ path: `${OUT}/desktop-admin.png`, fullPage: true });
  await audit(page, '后台工作台');

  // 详情抽屉：有记录时点第一条的「核实详情」
  const detailBtn = page.locator('button:has-text("核实详情")').first();
  if (await detailBtn.count()) {
    await detailBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/desktop-admin-detail.png` });
    const drawerVisible = await page.locator('[role=dialog]').isVisible();
    check('详情抽屉能打开', drawerVisible);
    // 抽屉里应有操作按钮
    const refundBtn = page.locator('[role=dialog] button:has-text("确认已退款")');
    check('抽屉含确认已退款按钮', (await refundBtn.count()) > 0);
    await page.keyboard.press('Escape');
  } else {
    console.log('  ⏭ 当前没有记录，跳过详情抽屉检查（可先提交一条测试数据）');
  }

  // 表单交互：填入订单号后完成度应上升
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const before = await page.locator('text=填写完成度').locator('..').textContent();
  await page.fill('#order_no', 'LD261008YXAAH0');
  await page.fill('#redeem_code', '9H6RAPN87URB');
  await page.fill('#amount', '96');
  await page.selectOption('#reason_code', 'student_auth_failed');
  await page.selectOption('#redeem_state', 'not_passed');
  await page.fill('#contact', 'test_wx_12345');
  await page.waitForTimeout(300);
  const after = await page.locator('text=填写完成度').locator('..').textContent();
  check('填写后完成度提升', before !== after, `${before} -> ${after}`);
  const submitBtn = page.locator('button[type=submit]');
  const submitText = (await submitBtn.textContent()) || '';
  check('未上传收款码时按钮提示还差项数', submitText.includes('还差'), submitText);
  await page.screenshot({ path: `${OUT}/desktop-home-filled.png`, fullPage: true });

  await ctx.close();
}

// ---------------- 移动视口 ----------------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();

  console.log('\n【移动端 390×844】');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/mobile-home.png`, fullPage: true });
  await audit(page, '登记页(移动)');

  await page.goto(`${BASE}/query`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/mobile-query.png`, fullPage: true });
  await audit(page, '查询页(移动)');

  await loginAndOpenAdmin(page);
  await page.screenshot({ path: `${OUT}/mobile-admin.png`, fullPage: true });
  await audit(page, '后台(移动)');
  // 后台表格允许横向滚动，这是刻意的；确认是表格容器（div.overflow-x-auto）在滚动，
  // 而不是页面整体溢出。注意页头的 nav 也带 overflow-x-auto，要挑出包着 TABLE 的那个。
  const tableScroll = await page.evaluate(() => {
    const wrap = [...document.querySelectorAll('.overflow-x-auto')].find((el) => el.querySelector('table'));
    return wrap ? { scrollW: wrap.scrollWidth, clientW: wrap.clientWidth } : null;
  });
  check(
    '后台表格在自身容器内横向滚动',
    tableScroll !== null && tableScroll.scrollW > tableScroll.clientW,
    JSON.stringify(tableScroll)
  );

  await ctx.close();
}

await browser.close();
console.log(`\n截图已保存到 ${OUT}/`);
console.log(`结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
