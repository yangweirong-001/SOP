'use client';

import type { SopDoc } from './types';
import { buildPrintHtml } from './export-word';

/**
 * PDF 一键下载（html2canvas + jsPDF + 单页超长 PDF + 图片高清叠加）
 *
 * 核心策略：
 *  1. 用 buildPrintHtml 生成与 Word 视觉一致的 HTML（同一份 CSS）
 *  2. 用 html2canvas 抓取整个 body 成 **一张长 canvas**（作为底图，含文字+表格+图片）
 *  3. jsPDF 以 **A4 宽 × 内容全高** 作为单页尺寸生成 PDF
 *  4. **图片高清叠加**：遍历 body 里所有 <img>，把每张图片以其原始分辨率
 *      用 pdf.addImage 独立嵌入 PDF，覆盖到底图对应位置。
 *      → PDF 里图片放大不糊，清晰度只受原图分辨率影响（不受 canvas scale 限制）
 *
 * 优点：
 *  - ✅ 单页超长：无换页、无空白页、无文字截断
 *  - ✅ 版式与 Word 完全一致（共用 buildPrintHtml）
 *  - ✅ 图片高清嵌入：PDF 里图片可无损放大查看细节
 *  - ✅ 一键下载 .pdf 文件
 *  - 📖 PDF 阅读器里像看长网页一样滚动
 *
 * 兜底：
 *  - 单页高度超过 jsPDF 5000mm 上限时自动降级为 A4 分页
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

    // 5. 一次抓取整个 body 成一张长 canvas 作为底图
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

    // 5.1 采集所有图片的位置与原始 dataURL —— 待会用 pdf.addImage 独立嵌入，
    //     覆盖到底图对应区域，实现"图片放大不糊"。
    const imageOverlays = await collectImageOverlays(idoc.body);

    // 6. 单页超长 PDF：宽度 A4，高度 = 全部内容 + 上下 margin，永不切断
    //    优点：无分页 → 无空白页 → 无文字截断，屏幕滚动阅读最舒服
    //    兜底：若内容超出 jsPDF 单页 5000mm 上限，降级为 A4 长图切片分页
    const A4_WIDTH_MM = 210;
    const margin = 20;
    const contentWidth = A4_WIDTH_MM - margin * 2; // 170

    // 图片按 contentWidth 缩放
    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // 目标 PDF 单页高度（含上下 margin）
    const singlePageHeight = imgHeight + margin * 2;
    const MAX_SINGLE_PAGE_MM = 5000; // jsPDF 单页最大高度限制

    // px → mm 换算比例：iframe 内容宽 IFRAME_WIDTH_PX 映射到 PDF 页宽 A4_WIDTH_MM。
    // 注意 imgWidth = contentWidth (170mm)，长图在 PDF 里显示时按 imgWidth / canvas.width 缩放，
    // 图片位置换算时用同样的比例即可。
    const pxToMm = imgWidth / IFRAME_WIDTH_PX;

    // 在指定 PDF 上叠加所有原图（覆盖底图对应区域），并对超出页面的做裁剪。
    const overlayImagesOnPdf = (
      pdf: import('jspdf').default,
      pageIndex: number,
      pageOffsetMm: number,
      pageHeightMm: number,
    ): void => {
      for (const ov of imageOverlays) {
        const xMm = margin + ov.leftPx * pxToMm;
        const yInFullMm = margin + ov.topPx * pxToMm;
        const wMm = ov.widthPx * pxToMm;
        const hMm = ov.heightPx * pxToMm;
        // 换算到当前页坐标系
        const yOnPage = yInFullMm - pageOffsetMm;
        // 完全不在本页内则跳过
        if (yOnPage + hMm < margin || yOnPage > margin + pageHeightMm) continue;
        pdf.setPage(pageIndex + 1);
        try {
          pdf.addImage(
            ov.dataUrl,
            ov.mime === 'image/png' ? 'PNG' : 'JPEG',
            xMm,
            yOnPage,
            wMm,
            hMm,
            undefined,
            'SLOW', // SLOW = 无压缩，保留原图质量
          );
        } catch {
          // 单张图片加载失败不影响整体
        }
      }
    };

    // 生成底图 dataURL
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    if (singlePageHeight <= MAX_SINGLE_PAGE_MM) {
      // ✅ 主路径：单页超长 PDF
      const pdf = new jsPDF({
        unit: 'mm',
        format: [A4_WIDTH_MM, singlePageHeight],
        orientation: 'portrait',
      });
      // 先画底图（含文字、表格、图片"底稿"）
      pdf.addImage(
        imgData,
        'JPEG',
        margin,
        margin,
        imgWidth,
        imgHeight,
        undefined,
        'FAST',
      );
      // 再把每张图片以原图分辨率独立嵌入 PDF，覆盖到底图对应区域 → 放大不糊
      overlayImagesOnPdf(pdf, 0, 0, imgHeight);
      pdf.save(`${sanitizeFilename(sop.title)}.pdf`);
    } else {
      // ⚠️ 兜底：内容超长，降级为 A4 分页（长图切片 + 图片高清叠加）
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      });
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297
      const contentHeight = pdfHeight - margin * 2; // 257

      let heightLeft = imgHeight;
      let y = margin;
      let pageIndex = 0;
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
      overlayImagesOnPdf(pdf, pageIndex, pageIndex * contentHeight, contentHeight);
      heightLeft -= contentHeight;
      while (heightLeft > 0) {
        y -= contentHeight;
        pdf.addPage();
        pageIndex += 1;
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
        overlayImagesOnPdf(pdf, pageIndex, pageIndex * contentHeight, contentHeight);
        heightLeft -= contentHeight;
      }
      pdf.save(`${sanitizeFilename(sop.title)}.pdf`);
    }
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

interface ImageOverlay {
  leftPx: number;   // 相对 body 左上角的偏移，含 body padding
  topPx: number;
  widthPx: number;
  heightPx: number;
  dataUrl: string;  // 原始分辨率图像的 data:URL
  mime: 'image/png' | 'image/jpeg';
}

/**
 * 采集 body 内所有 img 的位置与原图 dataURL，用于 pdf.addImage 高清叠加。
 * - 位置：img.getBoundingClientRect() 减去 body.rect，得到相对 body 的像素坐标（含 body padding）
 * - dataURL：把 img 画到一张 naturalWidth × naturalHeight 的临时 canvas 上再 toDataURL，
 *   得到原始分辨率的位图；PDF 里放大受原图分辨率上限，而非 html2canvas scale。
 * - 优先 PNG（保留细节）；PNG 过大时退回 JPEG 0.95。
 * - 跨域图无法读取时跳过（底图仍然存在，只是没高清叠加）。
 */
async function collectImageOverlays(
  root: HTMLElement,
): Promise<ImageOverlay[]> {
  const bodyRect = root.getBoundingClientRect();
  const imgs = Array.from(root.querySelectorAll('img'));
  const overlays: ImageOverlay[] = [];
  for (const img of imgs) {
    if (!img.complete || img.naturalWidth === 0) continue;
    const rect = img.getBoundingClientRect();
    const widthPx = rect.width;
    const heightPx = rect.height;
    if (widthPx <= 0 || heightPx <= 0) continue;

    const leftPx = rect.left - bodyRect.left;
    const topPx = rect.top - bodyRect.top;

    try {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0);
      let dataUrl = cv.toDataURL('image/png');
      let mime: 'image/png' | 'image/jpeg' = 'image/png';
      // PNG 超过 2MB 时切 JPEG 0.95，控制 PDF 体积
      if (dataUrl.length > 2 * 1024 * 1024) {
        dataUrl = cv.toDataURL('image/jpeg', 0.95);
        mime = 'image/jpeg';
      }
      overlays.push({ leftPx, topPx, widthPx, heightPx, dataUrl, mime });
    } catch {
      // 跨域 taint，跳过该图（底图截图仍能显示）
    }
  }
  return overlays;
}
