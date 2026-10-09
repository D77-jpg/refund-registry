/**
 * 列出线上那条数据层路径实际看到的内容（包含每行的关键字段），
 * 用于判断「线上的 2 条」到底是什么数据。
 */
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = /^DATABASE_URL=(.*)$/m.exec(env)[1].replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();
const { neon } = await import('@neondatabase/serverless');
const sql = neon(url);

console.log('连接串指纹:', `${url.length}:${url.slice(0, 30)}…${url.slice(-12)}`);
console.log('主机:', new URL(url).host);

const info = await sql(
  `SELECT current_database() AS db, current_schema() AS schema, pg_backend_pid() AS pid,
          inet_server_addr()::text AS server_addr, version() AS version`
);
console.log('数据库自述:', JSON.stringify(info[0]));

const rows = await sql(
  `SELECT id, order_no, amount, status, contact, created_at::text AS created_at,
          (receipt_url <> '') AS has_blob, length(receipt_data) AS b64_len
   FROM refunds ORDER BY id DESC LIMIT 20`
);
console.log(`本地看到的行数: ${rows.length}`);
for (const r of rows) console.log('  ', JSON.stringify(r));

const seq = await sql(`SELECT last_value, is_called FROM refunds_id_seq`);
console.log('自增序列:', JSON.stringify(seq[0]));
