import type { NextConfig } from 'next';

const isStaticExport = process.env.STATIC_EXPORT === '1';

// basePath 优先级：
// 1. 显式设置的 NEXT_PUBLIC_BASE_PATH
// 2. GitHub Actions 环境下从 GITHUB_REPOSITORY 派生（形如 /SOP）
// 3. 空
function computeBasePath(): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_PATH;
  if (explicit) return explicit;

  // GitHub Actions 自动注入 GITHUB_REPOSITORY (形如 "owner/repo")
  const ghRepo = process.env.GITHUB_REPOSITORY;
  if (isStaticExport && ghRepo && process.env.GITHUB_ACTIONS === 'true') {
    const [owner, repo] = ghRepo.split('/');
    // owner.github.io 类型仓库不需要 basePath
    if (repo && repo.toLowerCase() !== `${owner.toLowerCase()}.github.io`) {
      return `/${repo}`;
    }
  }
  return '';
}

const basePath = computeBasePath();

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.dev.coze.site'],
  ...(basePath && { basePath, assetPrefix: basePath }),
  ...(isStaticExport
    ? {
        output: 'export',
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {
        images: {
          remotePatterns: [
            {
              protocol: 'https',
              hostname: '*',
              pathname: '/**',
            },
          ],
        },
      }),
};

export default nextConfig;
