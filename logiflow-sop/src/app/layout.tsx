import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'LogiFlow SOP | 物流标准作业程序智能平台',
  description:
    'LogiFlow SOP 是面向物流团队的标准作业程序智能编辑平台，提供流程编排、风险管控、AI 智能优化与一键导出能力。',
  keywords: [
    'LogiFlow',
    '物流SOP',
    '标准作业程序',
    'AI Agent',
    '流程编辑器',
    '仓储入库',
    '末端配送',
    '退货处理',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased bg-slate-50 text-slate-800 min-h-screen">
        {process.env.NODE_ENV === 'development' ? <Inspector /> : null}
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
