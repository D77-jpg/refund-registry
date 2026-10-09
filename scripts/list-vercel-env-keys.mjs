/**
 * 通过 Vercel REST API 查看项目生产环境的环境变量清单（只看键名与类型，不打印值）。
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const authPath = path.join(process.env.APPDATA || homedir(), 'com.vercel.cli', 'Data', 'auth.json');
const auth = JSON.parse(readFileSync(authPath, 'utf8'));
const proj = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));

const res = await fetch(`https://api.vercel.com/v9/projects/${proj.projectId}/env?teamId=${proj.orgId}`, {
  headers: { Authorization: `Bearer ${auth.token}` }
});
const data = await res.json();
if (!res.ok) {
  console.error('读取失败', res.status, JSON.stringify(data).slice(0, 300));
  process.exit(1);
}
console.log('键名'.padEnd(30), '类型'.padEnd(8), '环境');
for (const e of data.envs) {
  console.log(e.key.padEnd(30), String(e.type).padEnd(8), (e.target || []).join(','));
}
