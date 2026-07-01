import type { NextConfig } from "next";

/**
 * Next.js 配置
 * - STATIC_EXPORT=1 时启用静态导出（用于 GitHub Pages / 任意静态托管）
 * - NEXT_PUBLIC_BASE_PATH 由 GitHub Actions 根据仓库名自动注入
 * - 本地开发（pnpm run dev）走 SSR，不受这里影响
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  // 只有静态导出时才启用，本地 dev 不影响
  ...(isStaticExport && {
    output: "export",
    // GitHub Pages 无法处理 Next 的图片优化，禁用
    images: { unoptimized: true },
    // 生成 /path/index.html 而不是 /path.html，方便部署
    trailingSlash: true,
  }),

  // basePath 让所有静态资源和路由带上仓库名前缀
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,

  // 构建产物在 out/ 目录
  distDir: isStaticExport ? ".next" : ".next",

  eslint: {
    // 构建时不阻塞在 lint 上（lint 单独通过 pnpm run lint 检查）
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 类型错误由 pnpm run ts-check 单独检查
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
