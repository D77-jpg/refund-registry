# 卡密退款登记工具 · 链动小铺

给「链动小铺」售卖的卡密做批量退款登记用：用户自助填单，你核实后人工打款。

## 已上线地址

| 用途 | 地址 |
| --- | --- |
| **用户登记页（发给用户）** | **https://refund-registry.vercel.app** |
| 用户查询进度 | https://refund-registry.vercel.app/query |
| 管理后台（核实/打款/导出） | https://refund-registry.vercel.app/admin |
| 部署自检 | https://refund-registry.vercel.app/api/health |

管理密码见 `docs/上线操作手册.md`（建议登录后尽快改成自己的密码）。

## 用户端要填什么

订单号（`LD…`，必填、唯一、重复提交会被拦）· 卡密兑换码（`XXXX-XXXX-XXXX`）· 退款金额（96 / 133.9 快捷选择）·
退款原因（对应「无法正常获取学生认证」等）· 兑换码当前状态 · 联系方式 · 收款码截图（浏览器端自动压缩后上传）。

## 管理后台能做什么

按状态/原因筛选、关键词搜索、查看收款码原图、单条或批量标记「已退款 / 驳回」、写处理备注（用户查询页可见）、
记录退款凭证号、导出 CSV（带 BOM，Excel 不乱码）。

## 数据存在哪

- **登记数据** → Neon 云 PostgreSQL（新加坡），应用自动建表，无需手工执行 SQL
- **收款码截图** → Vercel Blob 对象存储，数据库只存地址；后台通过需登录的接口代理读取，
  删除记录会连同图片一起删除（详见上线手册第七节）

## 本地开发

```bash
npm install
npm run build
npm start                 # http://127.0.0.1:3000
node scripts/smoke.mjs             # 30 项端到端接口自测
node scripts/check-consistency.mjs # 12 项数据一致性回归（防缓存陈旧读）
node scripts/check-mojibake.mjs    # 源码乱码检查
node scripts/page-check.mjs        # 页面渲染与关键文案检查（21 项）
node scripts/visual-check.mjs      # 无头浏览器布局体检 + 截图（26 项，需 playwright）
```

未配置 `DATABASE_URL` 时数据存在 `data/refunds.json`（仅本机测试）。配置后自动走 PostgreSQL 并自动建表。
未配置 `BLOB_READ_WRITE_TOKEN` 时收款码以 base64 存数据库；线上由 Vercel Blob 承载。

维护脚本：`delete-record.mjs`（按编号/前缀删记录）、`list-records.mjs`（列出全部记录）、
`cleanup-blob-orphans.mjs`（清理孤儿图片）、`seed-visual-data.mjs`（造视觉检查假数据）、
`make-fake-qr.mjs`（生成仿真二维码图）、`strip-bom.mjs`（去 BOM）。

## 已知限制

`*.vercel.app` 域名在中国大陆网络下经常无法访问（[Vercel 官方也有说明](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)），
手机用户可能打不开页面。要给国内用户稳定使用，需要绑定自己的域名或改用国内可访问的部署方式。
请注意：**在 Windows 上用 PowerShell 就地改写文件会破坏中文并写入 BOM**，本项目已因此踩坑两次，
改文件请用编辑器，并跑 `node scripts/check-mojibake.mjs` 兜底。

## 重新部署

```bash
npx vercel --prod --yes   # 约 40 秒发布到现有线上地址
```

## 详细文档

- [上线操作手册](docs/上线操作手册.md)：部署细节、环境变量、改密码、日常核实流程、已踩过的坑与风险提示
