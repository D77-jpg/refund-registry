/**
 * 去掉指定文件开头的 UTF-8 BOM。
 * Windows 下 PowerShell 的 Set-Content -Encoding UTF8 会写入 BOM，
 * 本项目已经因此踩过一次坑（环境变量和站名乱码），所以统一用 Node 处理。
 *
 * 用法：node scripts/strip-bom.mjs <文件...>
 */
import { readFileSync, writeFileSync } from 'fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('用法：node scripts/strip-bom.mjs <文件...>');
  process.exit(1);
}

let fixed = 0;
for (const file of files) {
  const buf = readFileSync(file);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    writeFileSync(file, buf.subarray(3));
    console.log(`已去除 BOM: ${file}`);
    fixed++;
  } else {
    console.log(`无需处理: ${file}`);
  }
}
console.log(`共修复 ${fixed} 个文件`);
