#!/usr/bin/env bash
# 构建可下载的静态版本：把 Next.js 项目导出为静态站点，打包 zip 放到 public/
# 用法：pnpm run build:static
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKUP=".api_backup_$$"

echo "→ 备份 API 路由（静态导出不支持 server-side API）"
if [ -d "src/app/api" ]; then
  mv src/app/api "$BACKUP"
fi

cleanup() {
  if [ -d "$BACKUP" ]; then
    echo "→ 恢复 API 路由"
    rm -rf src/app/api
    mv "$BACKUP" src/app/api
  fi
}
trap cleanup EXIT

echo "→ 静态构建 (STATIC_EXPORT=1)"
STATIC_EXPORT=1 NEXT_PUBLIC_CHAT_API_URL="${NEXT_PUBLIC_CHAT_API_URL:-}" \
  pnpm exec next build

echo "→ 生成 README.txt"
cat > out/README.txt <<'EOF'
LogiFlow SOP - 静态版本使用说明
=====================================

这是一个纯前端静态构建产物，可以直接在任意静态文件服务器上部署。

方式 A：本地快速预览（推荐）
------------------------------
需要 Node.js。解压后进入目录执行：

  npx serve .        # 或者：npx http-server -p 5000

浏览器打开 http://localhost:3000（serve）或 http://localhost:5000。

方式 B：本地任意静态服务器
------------------------------
Python:   python3 -m http.server 8000
Nginx:    把整个目录作为 root
Vercel/Netlify/GitHub Pages: 直接把目录上传即可

⚠ 不要用 file:// 直接双击 index.html —— 现代浏览器对 file:// 的模块加载有限制，
   页面会一片空白或 loading。请务必用静态服务器。

功能说明
------------------------------
- SOP 编辑器 / 目录 / 拖拽 / 图片粘贴 / 检查清单 / 备注 / 风险管控 —— 完全离线可用
- AI 助手 —— 需要在线后端。默认指向 LogiFlow 官方部署；
  如需切换成自己的，请在部署时设置环境变量 NEXT_PUBLIC_CHAT_API_URL 后重新构建。
- 所有 SOP 数据保存在浏览器 localStorage，清除浏览器数据会丢失。

EOF

echo "→ 打包 out/ → public/logiflow-standalone.zip"
rm -f public/logiflow-standalone.zip
if command -v zip >/dev/null 2>&1; then
  (cd out && zip -qr "../public/logiflow-standalone.zip" .)
else
  # tar fallback (produces .tar.gz)
  rm -f public/logiflow-standalone.tar.gz
  tar -czf public/logiflow-standalone.tar.gz -C out .
  echo "⚠ zip 不可用，已生成 tar.gz 版本"
fi

SIZE=""
if [ -f public/logiflow-standalone.zip ]; then
  SIZE=$(du -h public/logiflow-standalone.zip | awk '{print $1}')
  echo "✓ 完成：public/logiflow-standalone.zip ($SIZE)"
elif [ -f public/logiflow-standalone.tar.gz ]; then
  SIZE=$(du -h public/logiflow-standalone.tar.gz | awk '{print $1}')
  echo "✓ 完成：public/logiflow-standalone.tar.gz ($SIZE)"
fi
