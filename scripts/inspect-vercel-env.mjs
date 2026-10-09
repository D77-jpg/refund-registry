/**
 * 读取 Vercel 项目环境变量的真实值（用于排查环境变量是否被写入了不可见字符）。
 * 只打印码点与长度，不打印明文密码。
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const authPath = path.join(process.env.APPDATA || homedir(), 'com.vercel.cli', 'Data', 'auth.json');
const auth = JSON.parse(readFileSync(authPath, 'utf8'));
const proj = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
const token = auth.token;

const res = await fetch(
  `https://api.vercel.com/v9/projects/${proj.projectId}/env?teamId=${proj.orgId}&decrypt=true`,
  { headers: { Authorization: `Bearer ${token}` } }
);
const data = await res.json();
if (!res.ok) {
  console.error('读取失败', res.status, JSON.stringify(data).slice(0, 300));
  process.exit(1);
}

for (const e of data.envs) {
  const v = e.value ?? '';
  const codes = [...v].slice(0, 3).map((c) => c.codePointAt(0).toString(16)).join(',');
  const hasInvisible = /[\uFEFF\u200B-\u200D\u00A0\r\n\t]/.test(v);
  console.log(
    `${e.key.padEnd(26)} len=${String(v.length).padStart(4)} 首3码点=[${codes}] 含不可见字符=${hasInvisible} 预览=${v.slice(0, 12).replace(/[\uFEFF\u200B]/g, '·')}`
  );
}
