/**
 * 清理对象存储里无人引用的收款码（自测/中途放弃上传留下的图片）。
 * 做法：列出 Blob 里 receipts/ 下的所有对象，减去数据库中仍在引用的路径名，剩下的就是孤儿。
 *
 * 用法：node scripts/cleanup-blob-orphans.mjs [--dry]
 * 需要根目录的 .env.local 提供 BLOB_READ_WRITE_TOKEN 与 DATABASE_URL。
 */
import { readFileSync } from 'fs';
import { list, del } from '@vercel/blob';

const dry = process.argv.includes('--dry');
const env = readFileSync('.env.local', 'utf8');
const get = (k) => {
  const m = new RegExp(`^${k}=(.*)$`, 'm').exec(env);
  return m ? m[1].replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim() : '';
};
const token = get('BLOB_READ_WRITE_TOKEN');
const dbUrl = get('DATABASE_URL');
if (!token) throw new Error('.env.local 缺少 BLOB_READ_WRITE_TOKEN');
if (!dbUrl) throw new Error('.env.local 缺少 DATABASE_URL');

// 1) 数据库里在用的对象键
const { default: postgres } = await import('postgres');
const sql = postgres(dbUrl, { max: 1, prepare: false });
const rows = await sql`SELECT id, order_no, receipt_pathname FROM refunds WHERE receipt_pathname <> ''`;
const inUse = new Set(rows.map((r) => r.receipt_pathname));
console.log(`数据库在用的收款码：${inUse.size} 个`);
await sql.end();

// 2) 对象存储里的全部收款码
let cursor;
const blobs = [];
do {
  const page = await list({ token, prefix: 'receipts/', cursor, limit: 1000 });
  blobs.push(...page.blobs);
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
console.log(`对象存储里的收款码：${blobs.length} 个`);

const orphans = blobs.filter((b) => !inUse.has(b.pathname));
console.log(`无人引用的孤儿对象：${orphans.length} 个`);

if (orphans.length === 0) {
  console.log('无需清理。');
  process.exit(0);
}
for (const b of orphans) {
  console.log(`  - ${b.pathname} (${b.size} 字节)`);
}
if (dry) {
  console.log('\n(--dry 模式，未实际删除)');
  process.exit(0);
}
await del(orphans.map((b) => b.pathname), { token });
console.log(`已删除 ${orphans.length} 个孤儿对象。`);
