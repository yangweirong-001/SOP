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

  // buildPrintHtml body 有 40px×44px 内边距，iframe 宽度 720px 时：
  //   内容宽 = 720 - 44*2 = 632px ≈ 16.7cm，与 Word A4 2cm 边距 (17cm 内容宽) 几乎一致。
  // PDF 单页内容宽 = 210 - 20*2 = 170mm，1px≈0.264mm，图打进 PDF 无明显放大失真。
  const IFRAME_WIDTH_PX = 720;

  // 1. 造一个隐藏 iframe（srcdoc 与父页面同源但样式完全隔离）
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

    // 6. jsPDF 分页参数（与 Word A4 2cm 边距完全对齐：210 - 20*2 = 170mm）
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297
    const margin = 20; // 与 Word 版式一致
    const contentWidth = pdfWidth - margin * 2; // 170
    const contentHeight = pdfHeight - margin * 2; // 257

    // 7. 逐块渲染 body 的直接子元素，紧凑排布，避免"每块单独一页"造成大量空白
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
        windowWidth: IFRAME_WIDTH_PX,
        width: IFRAME_WIDTH_PX,
        height: Math.ceil(rect.height),
        scrollY: -rect.top,
        scrollX: 0,
        foreignObjectRendering: false,
      });
    };

    // 当前页已经用掉的高度（单位 mm），控制多块紧凑排布
    let pageUsed = 0;

    // 把单个 canvas 按当前 pageUsed 位置写入 PDF；如果放不下则智能换页
    const writeCanvasSmart = (cv: HTMLCanvasElement) => {
      const imgWidth = contentWidth;
      const imgHeight = (cv.height * imgWidth) / cv.width;
      const imgData = cv.toDataURL('image/jpeg', 0.92);

      // Case A：块比整页小 -> 若当前页放得下就紧接上一块画；放不下就换页并放到新页顶部
      if (imgHeight <= contentHeight) {
        if (pageUsed > 0 && pageUsed + imgHeight > contentHeight) {
          pdf.addPage();
          pageUsed = 0;
        }
        const y = margin + pageUsed;
        pdf.addImage(imgData, 'JPEG', margin, y, imgWidth, imgHeight, undefined, 'FAST');
        pageUsed += imgHeight;
        // 极端情况：几乎填满时也算作"页快满了"，避免下次紧贴时越界
        if (pageUsed >= contentHeight - 1) {
          pdf.addPage();
          pageUsed = 0;
        }
        return;
      }

      // Case B：块超长（大于整页） -> 独占页，从当前页顶端开始切分渲染
      if (pageUsed > 0) {
        pdf.addPage();
        pageUsed = 0;
      }
      let position = margin; // 首次落在页顶
      let heightLeft = imgHeight;
      pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= contentHeight;
      while (heightLeft > 0) {
        position -= contentHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= contentHeight;
      }
      // 最后一页最上方用掉的高度 = imgHeight - N*contentHeight 的余量
      const usedOnLastPage = imgHeight - Math.floor(imgHeight / contentHeight) * contentHeight;
      pageUsed = usedOnLastPage < contentHeight ? usedOnLastPage : 0;
    };

    // 把 body 直接子元素逐块渲染并紧凑排布
    for (const child of bodyChildren) {
      const cv = await renderEl(child);
      writeCanvasSmart(cv);
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
