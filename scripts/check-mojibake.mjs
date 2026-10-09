/**
 * 检查源码里是否存在「中文被按错误编码写坏」的乱码。
 *
 * 背景：Windows 上用 PowerShell 的 Set-Content 做就地改写时，
 * 曾把 UTF-8 中文按错误编码回写，导致注释和用户可见提示语全变成乱码。
 * 这个脚本用来兜底拦截这类事故。
 *
 * 用法：node scripts/check-mojibake.mjs
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// 用码点拼出「乱码特征字」，避免本文件自己触发检查
const FEATURE_CODEPOINTS = [0x951b, 0x9286, 0x9225, 0x93c6, 0x7487, 0x7edb, 0x94e2, 0x93c8];
const FEATURE = FEATURE_CODEPOINTS.map((c) => String.fromCodePoint(c)).join('');
const MOJIBAKE_RE = new RegExp(`[${FEATURE}]{2,}`);

// 全角问号出现在字符串里通常也是被写坏的痕迹
const SUSPICIOUS_RE = /[\uFFFD]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (['node_modules', '.next', '.git', 'screenshots'].includes(name)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx|mjs|js|json|md|css)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

let bad = 0;
for (const dir of ['app', 'components', 'lib', 'scripts', 'docs']) {
  let files;
  try {
    files = walk(dir);
  } catch {
    continue;
  }
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (MOJIBAKE_RE.test(line) || SUSPICIOUS_RE.test(line)) {
        bad++;
        console.log(`${file}:${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    });
  }
}

console.log(bad === 0 ? '\n✅ 未发现乱码' : `\n❌ 发现 ${bad} 行乱码`);
process.exit(bad === 0 ? 0 : 1);
