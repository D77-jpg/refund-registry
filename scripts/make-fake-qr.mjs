/**
 * 生成一张仿真的「收款码」PNG（白底 + 定位角 + 随机码点），
 * 用于视觉检查与本地自测：比 1x1 像素更能反映真实渲染效果。
 *
 * 用法：node scripts/make-fake-qr.mjs [输出路径] [尺寸]
 */
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const out = process.argv[2] || 'tmp-fake-qr.png';
const size = Number(process.argv[3] || 480);
const modules = 25; // 25x25 的码点矩阵

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// 构造码点矩阵：三个定位角 + 伪随机数据区（固定种子，保证可复现）
const grid = Array.from({ length: modules }, () => Array(modules).fill(0));
function finder(r0, c0) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const edge = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      grid[r0 + r][c0 + c] = edge || core ? 1 : 0;
    }
  }
}
finder(0, 0);
finder(0, modules - 7);
finder(modules - 7, 0);
let seed = 20261009;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
for (let r = 0; r < modules; r++) {
  for (let c = 0; c < modules; c++) {
    if (grid[r][c] === 0 && rnd() > 0.52) grid[r][c] = 1;
  }
}

// 渲染成像素：白色底 + 黑色码点 + 四周留白
const margin = 2;
const scale = Math.floor(size / (modules + margin * 2));
const dim = scale * (modules + margin * 2);
const rows = [];
for (let y = 0; y < dim; y++) {
  const row = Buffer.alloc(1 + dim * 3);
  row[0] = 0; // filter type
  for (let x = 0; x < dim; x++) {
    const mr = Math.floor(y / scale) - margin;
    const mc = Math.floor(x / scale) - margin;
    const dark =
      mr >= 0 && mc >= 0 && mr < modules && mc < modules && grid[mr][mc] === 1;
    const v = dark ? 0x18 : 0xff;
    row[1 + x * 3] = v;
    row[2 + x * 3] = v;
    row[3 + x * 3] = v;
  }
  rows.push(row);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(dim, 0);
ihdr.writeUInt32BE(dim, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(Buffer.concat(rows))),
  chunk('IEND', Buffer.alloc(0))
]);

writeFileSync(out, png);
console.log(`已生成 ${out}（${dim}x${dim}，${png.length} 字节）`);
