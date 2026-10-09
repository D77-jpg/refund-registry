/**
 * 连续请求线上 /api/health，检查是否存在缓存导致的陈旧数据。
 * 用法：node scripts/probe-health.mjs [url] [次数]
 */
const url = process.argv[2] || 'https://refund-registry.vercel.app/api/health';
const times = Number(process.argv[3] || 4);

for (let i = 0; i < times; i++) {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  console.log(
    `${i} HTTP ${res.status} | age=${res.headers.get('age')} | x-vercel-cache=${res.headers.get('x-vercel-cache')} | cache-control=${res.headers.get('cache-control')}`
  );
  console.log(`   detail: ${json?.data?.detail} | time: ${json?.data?.time}`);
  await new Promise((s) => setTimeout(s, 1200));
}
