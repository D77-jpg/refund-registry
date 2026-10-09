/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  // 收款码截图用 base64 存在数据库里，API 需要接收较大的 JSON body
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb'
    }
  }
};

export default nextConfig;
