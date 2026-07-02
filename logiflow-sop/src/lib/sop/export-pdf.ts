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

    // 6. jsPDF 分页参数
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297
    const margin = 8;
    const contentWidth = pdfWidth - margin * 2; // 194
    const contentHeight = pdfHeight - margin * 2; // 281
    const pxPerMm = 794 / pdfWidth; // html2canvas 像素 → PDF 毫米

    // 7. 收集"不可切割块"（每个步骤/判断节点）+ 其余元素，逐块渲染
    //    这样 html2canvas 不会把单个步骤切成两半
    const blocks = Array.from(
      idoc.body.querySelectorAll<HTMLElement>('[data-pdf-block]'),
    );
    const bodyChildren = Array.from(idoc.body.children) as HTMLElement[];

    // 渲染单个元素为 canvas
    const renderEl = async (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794,
        width: 794,
        height: Math.ceil(rect.height),
        scrollY: -rect.top,
        scrollX: 0,
        foreignObjectRendering: false,
      });
    };

    // 把单个 canvas 写入 PDF（可能跨页，但只在块之间分页）
    const writeCanvas = (cv: HTMLCanvasElement) => {
      const imgWidth = contentWidth;
      const imgHeight = (cv.height * imgWidth) / cv.width;
      const imgData = cv.toDataURL('image/jpeg', 0.92);

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
    };

    // 当前页剩余高度
    let pageUsed = 0;
    const addPageIfNeeded = (needMm: number) => {
      if (pageUsed + needMm > contentHeight && pageUsed > 0) {
        pdf.addPage();
        pageUsed = 0;
      }
    };

    // 把 body 直接子元素按"是否 data-pdf-block"分组，逐块渲染
    for (const child of bodyChildren) {
      if (child.hasAttribute('data-pdf-block')) {
        // 不可切割块：单独渲染
        const cv = await renderEl(child);
        const blockMm = (cv.height * contentWidth) / cv.width;
        addPageIfNeeded(blockMm);
        writeCanvas(cv);
        pageUsed += blockMm;
      } else {
        // 普通元素（目录、标题等）：整段渲染
        const cv = await renderEl(child);
        const blockMm = (cv.height * contentWidth) / cv.width;
        addPageIfNeeded(blockMm);
        writeCanvas(cv);
        pageUsed += blockMm;
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
