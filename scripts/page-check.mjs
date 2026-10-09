/**
 * 页面渲染冒烟检查：确认各页面能正常渲染、关键文案存在、没有乱码。
 * 用法：node scripts/page-check.mjs [base]
 */
const BASE = process.argv[2] || process.env.CHECK_BASE || 'http://127.0.0.1:3000';

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

const pages = [
  {
    path: '/',
    name: '用户登记页',
    // 空表单时提交按钮显示「还差 N 项，完成后即可提交」，填满后才变成「提交退款登记」
    must: ['填写完成度', '收款码', '链动小铺订单号', '卡密 / 兑换码', '退款原因', '完成后即可提交']
  },
  { path: '/query', name: '进度查询页', must: ['查询退款进度', '联系方式后 4 位'] },
  { path: '/admin/login', name: '后台登录页', must: ['退款核实后台', '管理密码'] }
];

console.log(`\n▶ 目标 ${BASE}\n`);

for (const p of pages) {
  const res = await fetch(`${BASE}${p.path}`);
  const html = await res.text();
  check(`${p.name} 可访问（${p.path}）`, res.ok, `status=${res.status}`);
  for (const text of p.must) {
    check(`${p.name} 含「${text}」`, html.includes(text));
  }
  check(`${p.name} 无乱码问号串`, !html.includes('??????'));
}

// 站名是否正确渲染（不再是 ? 或空）
{
  const html = await (await fetch(`${BASE}/`)).text();
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] || '';
  check('页面标题已渲染站名', title.includes('链动小铺订单退款') && !title.includes('??????'), title);
  const header = /<span class="block truncate text-sm font-semibold[^>]*>([^<]*)<\/span>/.exec(html)?.[1] || '';
  check('页头站名非空且无问号', header.trim().length > 0 && !header.includes('?'), `'${header}'`);
}

// 后台未登录应跳转登录页
{
  const res = await fetch(`${BASE}/admin`, { redirect: 'manual' });
  check('未登录访问后台被重定向/拒绝', res.status === 307 || res.status === 302 || res.status === 401, `status=${res.status}`);
}

// 404 页面
{
  const res = await fetch(`${BASE}/this-page-does-not-exist`);
  check('未知路径返回 404 页面', res.status === 404, `status=${res.status}`);
}

// 样式表可加载
{
  const html = await (await fetch(`${BASE}/`)).text();
  const cssPath = /(?:href)="(\/_next\/static\/css\/[^"]+\.css)"/.exec(html)?.[1];
  if (cssPath) {
    const css = await fetch(`${BASE}${cssPath}`);
    const body = await css.text();
    check('样式表可加载且含自定义色板', css.ok && body.includes('--tw') && body.length > 5000, `bytes=${body.length}`);
  } else {
    check('样式表可加载且含自定义色板', false, '未找到 css 链接');
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
