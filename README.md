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

## 本地开发

```bash
npm install
npm run build
npm start                 # http://127.0.0.1:3000
node scripts/smoke.mjs    # 21 项端到端接口自测
```

未配置 `DATABASE_URL` 时数据存在 `data/refunds.json`（仅本机测试）。配置后自动走 PostgreSQL 并自动建表。

## 重新部署

```bash
npx vercel --prod --yes   # 约 40 秒发布到现有线上地址
```

## 详细文档

- [上线操作手册](docs/上线操作手册.md)：部署细节、环境变量、改密码、日常核实流程、已踩过的坑与风险提示
