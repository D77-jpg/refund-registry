/**
 * 修复 Vercel 上的 DATABASE_URL：删掉旧值（我们之前写入时意外带上了 UTF-8 BOM），
 * 再用干净的值重建。用 Node 写临时文件可确保没有 BOM。
 */
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

const envLocal = readFileSync('.env.local', 'utf8');
const m = /^DATABASE_URL=(.*)$/m.exec(envLocal);
if (!m) throw new Error('.env.local 里没有 DATABASE_URL');
const raw = m[1];
const clean = raw.replace(/^\uFEFF/, '').replace(/[\r\n\t]/g, '').trim();

console.log('原值首字符码点:', raw.codePointAt(0)?.toString(16));
console.log('清洗后首字符:', clean.slice(0, 11) + '...', '长度', clean.length, '含BOM:', clean.includes('\uFEFF'));

const tmp = path.join(process.env.TEMP || '.', 'vercel-clean-dburl.txt');
writeFileSync(tmp, clean, { encoding: 'utf8' }); // Node 默认不写 BOM

const run = (args, input) =>
  execFileSync(process.execPath, [path.join('node_modules', 'vercel', 'dist', 'index.js'), ...args], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1' }
  });

const safe = (fn) => {
  try {
    return fn();
  } catch (e) {
    return String(e.stdout || e.stderr || e.message).trim().split('\n').slice(-3).join(' | ');
  }
};

console.log('当前变量:', safe(() => run(['env', 'ls', 'production'])).split('\n').slice(0, 8).join(' / '));
console.log('删除旧值:', safe(() => run(['env', 'rm', 'DATABASE_URL', 'production', '--yes'])));
console.log('写入新值:', safe(() => run(['env', 'add', 'DATABASE_URL', 'production'], clean)));
console.log('确认:', safe(() => run(['env', 'ls', 'production'])).split('\n').slice(0, 8).join(' / '));
