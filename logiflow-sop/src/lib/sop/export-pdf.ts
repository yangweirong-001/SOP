'use client';

import type { SopDoc } from './types';
import { buildPrintHtml } from './export-word';

/**
 * 真·PDF 导出（浏览器打印引擎方案）
 *
 * 用系统级 PDF 引擎渲染，生成的是**真文字 PDF**：
 *  - 文字可复制、可搜索、无像素失真
 *  - 版式与 Word 100% 一致（因为共用同一份 buildPrintHtml）
 *  - 图片矢量嵌入，比 html2canvas 截图清晰
 *
 * 用户操作路径：
 *  点「导出 PDF」→ 新窗口 → 系统打印对话框自动弹出 → 目的地选「另存为 PDF」→ 保存
 */
export async function exportPdf(sop: SopDoc): Promise<void> {
  if (typeof window === 'undefined') return;

  const html = injectPrintTip(buildPrintHtml(sop));

  const win = window.open('', '_blank', 'width=1000,height=1100');
  if (!win) {
    alert(
      '浏览器阻止了新窗口，请在地址栏右侧允许弹窗后重试。\n\n或直接使用浏览器菜单 → 打印 → 目的地选「另存为 PDF」。',
    );
    return;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();

  // 等图片加载完毕再触发打印，避免图片未加载出来变空白
  await waitForImagesInWindow(win);

  // 触发系统打印对话框：用户在其中选择「另存为 PDF」
  win.focus();
  // 微延迟一帧，确保 DOM 布局完成
  win.setTimeout(() => {
    try {
      win.print();
    } catch {
      // 部分浏览器策略下会抛异常，忽略即可，用户可以点顶部按钮再次触发
    }
  }, 200);
}

/**
 * 在打印 HTML 的 head/body 里注入一个顶部提示条：
 *  - 屏幕预览时显示，告诉用户如何选「另存为 PDF」+ 关闭页眉页脚
 *  - `@media print` 时自动隐藏，不会出现在最终 PDF 里
 */
function injectPrintTip(html: string): string {
  const tipStyle = `
    <style>
      .__pdf_tip__ {
        position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
        padding: 14px 24px;
        background: linear-gradient(90deg, #2563eb, #4f46e5);
        color: #fff;
        font: 14px/1.6 "Microsoft YaHei", "PingFang SC", -apple-system, sans-serif;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
      }
      .__pdf_tip__ b { color: #fde68a; }
      .__pdf_tip__ ol { margin: 6px 0 0 22px; padding: 0; }
      .__pdf_tip__ ol li { margin: 2px 0; }
      .__pdf_tip__ .actions { margin-top: 6px; }
      .__pdf_tip__ .btn {
        display: inline-block; margin-right: 8px; padding: 4px 12px;
        background: #ffffff; color: #2563eb; border-radius: 4px;
        cursor: pointer; font-weight: bold; font-size: 13px;
        border: 0;
      }
      .__pdf_tip__ .btn-ghost {
        background: transparent; color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.6);
      }
      body.__pdf__ { padding-top: 130px !important; }
      @media print {
        .__pdf_tip__ { display: none !important; }
        body.__pdf__ { padding-top: 0 !important; }
      }
    </style>
  `;
  const tipDiv = `
    <div class="__pdf_tip__" id="__pdf_tip__">
      💡 <b>另存为 PDF 步骤（跟 Word 版式完全一致的真文字 PDF）</b>
      <ol>
        <li>「目的地」选择 <b>另存为 PDF</b>（Save as PDF）</li>
        <li>「更多设置」→ 取消勾选 <b>页眉和页脚</b>（去掉浏览器自动加的日期/URL/页码）</li>
        <li>点「保存」→ 完成 ✅</li>
      </ol>
      <div class="actions">
        <button class="btn" onclick="window.print()">🖨️ 再次打开打印对话框</button>
        <button class="btn btn-ghost" onclick="var el=document.getElementById('__pdf_tip__');if(el)el.remove();document.body.classList.remove('__pdf__');">收起提示</button>
      </div>
    </div>
  `;
  return html
    .replace('</head>', `${tipStyle}</head>`)
    .replace('<body>', `<body class="__pdf__">${tipDiv}`);
}

function waitForImagesInWindow(win: Window, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = (): void => {
      try {
        const doc = win.document;
        const imgs = Array.from(doc.images);
        const allLoaded = imgs.every(
          (img) => img.complete && img.naturalHeight !== 0,
        );
        if (allLoaded || Date.now() - start > timeoutMs) {
          resolve();
          return;
        }
      } catch {
        // 窗口跨域或已关闭
        resolve();
        return;
      }
      win.setTimeout(check, 100);
    };
    try {
      if (win.document.readyState === 'complete') {
        check();
      } else {
        win.addEventListener('load', check, { once: true });
        // 兜底 timeout，防止 load 事件不触发
        win.setTimeout(check, 500);
      }
    } catch {
      resolve();
    }
  });
}
