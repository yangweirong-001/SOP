'use client';

import type { SopDoc } from './types';
import { buildPrintHtml } from './export-word';

/**
 * 真·PDF 导出：使用隐藏 iframe (srcdoc) 完全隔离 Tailwind 4 的
 * oklch()/lab() 色彩变量，再用 html2canvas 抓 iframe 内文档、
 * jsPDF 分页成 A4 PDF 后直接触发下载，不走浏览器打印预览。
 *
 * html2canvas / jspdf 使用动态 import，把它们从主 bundle 中剔除，
 * 只在用户点"导出 PDF"时才按需加载。
 */
export async function exportPdf(sop: SopDoc): Promise<void> {
  // 按需加载 PDF 相关依赖（首次调用时才会去拉两个 chunk）
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const html = buildPrintHtml(sop);

  // 1. 造一个隐藏 iframe（srcdoc 与父页面同源但样式完全隔离）
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-99999px';
  iframe.style.top = '0';
  iframe.style.width = '794px'; // A4 96dpi 宽度
  iframe.style.height = '10px';
  iframe.style.border = '0';
  iframe.style.zIndex = '-1';
  iframe.setAttribute('data-pdf-iframe', '1');
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    // 2. 用 srcdoc 装载自包含 HTML，等 load 完成
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

    // 3. 补一层兜底：万一有 oklch/lab 漏进来的场景，
    //    在 iframe 里注入一段强制回退样式（正常情况下不生效，只是防御）
    const fallback = idoc.createElement('style');
    fallback.textContent = `
      /* PDF 导出兜底：显式回退颜色，防止残留 oklch/lab 变量 */
      html, body { background: #ffffff !important; color: #0f172a !important; }
    `;
    idoc.head.appendChild(fallback);

    // 4. 等 iframe 内所有图片就绪
    await waitForImages(idoc.body);
    await new Promise((resolve) =>
      iwin.requestAnimationFrame(() => resolve(null)),
    );

    // 5. iframe 高度撑到内容全高，防止 html2canvas 截不到底
    const scrollHeight = Math.max(
      idoc.body.scrollHeight,
      idoc.documentElement.scrollHeight,
    );
    iframe.style.height = `${scrollHeight + 40}px`;
    await new Promise((resolve) =>
      iwin.requestAnimationFrame(() => resolve(null)),
    );

    // 6. html2canvas 抓 iframe 内的 body（Tailwind 变量进不来）
    const canvas = await html2canvas(idoc.body, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794,
      width: 794,
      height: scrollHeight,
      // 让 html2canvas 使用 iframe 里的 window 计算样式
      foreignObjectRendering: false,
    });

    // 7. jsPDF 分页
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297
    const margin = 8;
    const contentWidth = pdfWidth - margin * 2; // 194
    const contentHeight = pdfHeight - margin * 2; // 281

    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    if (imgHeight <= contentHeight) {
      pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight, undefined, 'FAST');
    } else {
      let heightLeft = imgHeight;
      let position = margin;
      pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= contentHeight;
      while (heightLeft > 0) {
        position -= contentHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= contentHeight;
      }
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
