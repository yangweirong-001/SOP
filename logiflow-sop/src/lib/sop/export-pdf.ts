'use client';

import type { SopDoc } from './types';
import { buildPrintHtml } from './export-word';

/**
 * PDF 一键下载（html2canvas + jsPDF + 长图切片分页）
 *
 * 核心策略：
 *  1. 用 buildPrintHtml 生成与 Word 视觉一致的 HTML（同一份 CSS）
 *  2. 用 html2canvas 抓取整个 body 成 **一张长 canvas**（不再逐块）
 *  3. jsPDF 按 A4 内容区高度 **连续切片**，每一页都紧贴上下页
 *
 * 相比"逐块渲染紧凑排布"：
 *  - ✅ 彻底消灭空白页（长图连续切，没有换页留白）
 *  - ✅ 版式与 Word 完全一致（共用 buildPrintHtml）
 *  - ✅ 一键下载 .pdf 文件（不弹打印对话框）
 *  - ⚠️ 由于 html2canvas 不识别 CSS page-break，页尾可能切到某一行的中间；
 *      已通过较大 line-height（1.6）和表格 padding（8px）降低视觉冲击。
 *
 * html2canvas / jspdf 走动态 import，只在用户点击时按需加载。
 */
export async function exportPdf(sop: SopDoc): Promise<void> {
  if (typeof window === 'undefined') return;

  // 按需加载依赖
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const html = buildPrintHtml(sop);

  // 让 iframe 内容宽度对齐 Word A4 2cm 边距：210mm - 40mm = 170mm ≈ 642px @96dpi。
  // buildPrintHtml body 有 40px×44px 内边距，实际内容宽 ≈ 720-88 = 632px。
  const IFRAME_WIDTH_PX = 720;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-99999px';
  iframe.style.top = '0';
  iframe.style.width = `${IFRAME_WIDTH_PX}px`;
  iframe.style.height = '10px';
  iframe.style.border = '0';
  iframe.style.zIndex = '-1';
  iframe.setAttribute('data-pdf-iframe', '1');
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    // 1. 装载 srcdoc 等 load 完成
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('iframe 加载超时')),
        15000,
      );
      iframe.addEventListener(
        'load',
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      iframe.srcdoc = html;
    });

    const idoc = iframe.contentDocument;
    const iwin = iframe.contentWindow;
    if (!idoc || !idoc.body || !iwin) {
      throw new Error('无法访问 iframe 内容文档');
    }

    // 2. 兜底：强制回退颜色，防止 oklch/lab 变量污染
    const fallback = idoc.createElement('style');
    fallback.textContent = `
      html, body { background: #ffffff !important; color: #0f172a !important; }
    `;
    idoc.head.appendChild(fallback);

    // 3. 等图片加载
    await waitForImages(idoc.body);
    await new Promise((resolve) =>
      iwin.requestAnimationFrame(() => resolve(null)),
    );

    // 4. iframe 高度撑满内容，防止 html2canvas 截不到底
    const totalHeight = Math.max(
      idoc.body.scrollHeight,
      idoc.documentElement.scrollHeight,
    );
    iframe.style.height = `${totalHeight + 40}px`;
    await new Promise((resolve) =>
      iwin.requestAnimationFrame(() => resolve(null)),
    );

    // 5. 一次抓取整个 body 成一张长 canvas
    const canvas = await html2canvas(idoc.body, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: IFRAME_WIDTH_PX,
      width: IFRAME_WIDTH_PX,
      height: totalHeight,
      scrollY: 0,
      scrollX: 0,
      foreignObjectRendering: false,
    });

    // 6. jsPDF：A4 + Word 一致的 2cm 边距
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297
    const margin = 20; // 与 Word 版式一致
    const contentWidth = pdfWidth - margin * 2; // 170
    const contentHeight = pdfHeight - margin * 2; // 257

    // 7. 按 contentWidth 缩放整张长图后的整体高度
    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    // 8. 长图切片分页：
    //    每一页都 addImage 整张图，通过 y 负偏移让不同段落露在当前页内容区。
    //    页面切换处内容连续无间隙，彻底消灭空白页。
    let heightLeft = imgHeight;
    let y = margin; // 第 1 页：图片顶端对齐 margin

    pdf.addImage(
      imgData,
      'JPEG',
      margin,
      y,
      imgWidth,
      imgHeight,
      undefined,
      'FAST',
    );
    heightLeft -= contentHeight;

    while (heightLeft > 0) {
      y -= contentHeight; // 把整张长图上移 contentHeight，露出下一段
      pdf.addPage();
      pdf.addImage(
        imgData,
        'JPEG',
        margin,
        y,
        imgWidth,
        imgHeight,
        undefined,
        'FAST',
      );
      heightLeft -= contentHeight;
    }

    pdf.save(`${sanitizeFilename(sop.title)}.pdf`);
  } finally {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}

function waitForImages(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  if (imgs.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    const check = () => {
      if (done >= imgs.length) {
        window.clearTimeout(timer);
        finish();
      }
    };
    imgs.forEach((img) => {
      if (img.complete && img.naturalHeight !== 0) {
        done += 1;
        check();
        return;
      }
      const onDone = () => {
        done += 1;
        check();
      };
      img.addEventListener('load', onDone, { once: true });
      img.addEventListener('error', onDone, { once: true });
    });
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'SOP';
}
