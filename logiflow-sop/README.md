# LogiFlow SOP · 物流 SOP 智能管理系统

一个可自部署的 SOP（标准作业程序）编辑器，专注物流场景。支持拖拽排序、判断节点、多媒体图注、AI 助手，并可导出 HTML / Word / PDF。

## 🚀 一键部署到 GitHub Pages

### 3 步走

**1. Fork 或推送本项目到你的 GitHub**

```bash
git clone <当前项目>
cd <项目目录>
git remote set-url origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

**2. 打开仓库的 GitHub Pages 设置**

在仓库页面：**Settings → Pages**

在 "Build and deployment" 下：
- Source: 选择 **GitHub Actions**
- 保存

**3. 触发部署**

推送任意 commit 到 `main` 分支，或者在 **Actions** 页面手动 Run workflow。

大约 2-3 分钟后，你的站点就发布到：
- 如果仓库名是 `你的用户名.github.io` → 访问 `https://你的用户名.github.io/`
- 否则 → 访问 `https://你的用户名.github.io/仓库名/`

Actions 会自动识别你的仓库名并配置好 `basePath`，无需手动改。

## 🤖 关于 AI 助手（可选）

编辑器右下角的 AI 助手需要一个后端 LLM 接口，GitHub Pages 是纯静态托管不支持后端。你有 3 个选择：

### 选择 1 · 不启用 AI（默认）
不做任何配置。SOP 编辑、导出等核心功能完全可用；AI 按钮点击后会看到"未配置接口"提示。

### 选择 2 · 用现成的 Coze 部署
在 GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret**：
- Name: `CHAT_API_URL`
- Value: `https://your-coze-preview.dev.coze.site/api/chat`

保存后重新触发 Actions，AI 就能用。

### 选择 3 · 用你自己的后端
同上，把 `CHAT_API_URL` 指向你自建的 OpenAI-compatible 流式接口（SSE 协议）。接口要求见 `src/app/api/chat/route.ts`。

## 🛠 本地开发

```bash
pnpm install
pnpm run dev    # http://localhost:5000
```

## 📦 本地打静态包

```bash
pnpm run build:static
# 产物：public/logiflow-standalone.zip + public/logiflow-standalone.tar.gz
```

解压后放到任意静态服务器（Nginx / Vercel / Netlify / OSS）都能跑。

## 🧩 技术栈

- Next.js 16 (App Router) + React 19 + TypeScript 5
- Tailwind CSS 4 + shadcn/ui
- html2canvas + jsPDF （PDF 导出，动态 import）
- lucide-react （图标）

## 📄 License

MIT
