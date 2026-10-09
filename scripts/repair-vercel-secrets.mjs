/**
 * 重写 Vercel 生产环境的三个 secret 变量，确保不带 BOM / 换行等不可见字符。
 * 用 Node 读取 .env.local（Node 不写 BOM）并通过 stdin 传给 vercel CLI。
 */
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

const envLocal = readFileSync('.env.local', 'utf8');
const readVar = (key) => {
  const m = new RegExp(`^${key}=(.*)$`, 'm').exec(envLocal);
  if (!m) throw new Error(`.env.local 缺少 ${key}`);
  return m[1].replace(/^\uFEFF/, '').replace(/[\r\n\t]/g, '').trim();
};

const vercelCli = path.join('node_modules', 'vercel', 'dist', 'index.js');
const run = (args, input) =>
  execFileSync(process.execPath, [vercelCli, ...args], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1' }
  });
const safe = (fn) => {
  try {
    return fn() || 'ok';
  } catch (e) {
    return String(e.stdout || e.stderr || e.message).trim().split('\n').slice(-2).join(' | ');
  }
};

const targets = ['ADMIN_PASSWORD', 'AUTH_SECRET', 'DATABASE_URL'];
for (const key of targets) {
  const value = readVar(key);
  const firstCode = value.codePointAt(0).toString(16);
  console.log(`\n[${key}] 长度=${value.length} 首字符码点=0x${firstCode}`);
  console.log('  删除旧值:', safe(() => run(['env', 'rm', key, 'production', '--yes'])).split('\n').pop());
  console.log('  写入新值:', safe(() => run(['env', 'add', key, 'production'], value)).split('\n').pop());
}

console.log('\n最终变量列表：');
console.log(safe(() => run(['env', 'ls', 'production'])));
