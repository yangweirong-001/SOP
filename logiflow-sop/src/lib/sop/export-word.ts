import type { SopDoc, ActionStep, DecisionStep } from './types';

interface Group {
  action: ActionStep;
  actionNo: number; // 只对操作步骤连续编号
  decisions: { d: DecisionStep; localNo: number }[];
}

function groupForExport(sop: SopDoc): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let counter = 0;
  sop.steps.forEach((s, idx) => {
    if (s.type === 'action') {
      counter += 1;
      current = { action: s, actionNo: counter, decisions: [] };
      groups.push(current);
    } else if (current) {
      current.decisions.push({ d: s, localNo: current.decisions.length + 1 });
    } else {
      // 悬空判断（罕见），单独成组
      groups.push({
        action: {
          id: -idx,
          type: 'action',
          title: '（未挂载操作步骤）',
          content: '',
        } as ActionStep,
        actionNo: 0,
        decisions: [{ d: s, localNo: 1 }],
      });
    }
  });
  return groups;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function imagesBlock(
  images: string[] | undefined,
  label: string,
  captions?: string[],
): string {
  if (!images || images.length === 0) return '';
  // Word 中 <img> 需要显式 width 才能正确按页宽布局，
  // A4 内容区约 540px，两列各 256px、单列 540px。
  const isSingle = images.length === 1;
  const cellWidth = isSingle ? 540 : 256;
  const capOf = (i: number): string => (captions?.[i] ?? '').trim();
  const cell = (src: string, i: number, single: boolean): string => {
    const cap = capOf(i);
    const capLine = cap
      ? `<div style="margin-top:4px;font-size:12px;color:#475569;line-height:1.5;">${escapeHtml(cap)}</div>`
      : '';
    const tag = `<div style="margin-top:2px;font-size:11px;color:#94a3b8;">图 ${i + 1}</div>`;
    const width = single
      ? 'style="padding:6px;border:1px solid #e2e8f0;text-align:center;"'
      : 'style="padding:6px;border:1px solid #e2e8f0;text-align:center;width:50%;"';
    return `<td valign="top" ${width}>
           <img src="${src}" width="${cellWidth}" style="width:${cellWidth}px;max-width:100%;height:auto;display:block;margin:0 auto;" alt="${escapeHtml(cap || label)}" />
           ${tag}
           ${capLine}
         </td>`;
  };
  // 每行最多 2 张
  const rows: string[] = [];
  if (isSingle) {
    rows.push(`<tr>${cell(images[0], 0, true)}</tr>`);
  } else {
    for (let i = 0; i < images.length; i += 2) {
      const chunk = images
        .slice(i, i + 2)
        .map((src, j) => cell(src, i + j, false))
        .join('');
      rows.push(`<tr>${chunk}${images.length - i === 1 ? '<td style="border:1px solid #e2e8f0;background:#f8fafc;"></td>' : ''}</tr>`);
    }
  }
  return `<tr><td colspan="2" style="padding:8px 0;"><div style="font-size:12px;color:#64748b;margin-bottom:6px;">${label}</div><table style="width:100%;border-collapse:collapse;table-layout:fixed;">${rows.join('')}</table></td></tr>`;
}

function substepsBlock(substeps: string[] | undefined): string {
  const hasItems = substeps && substeps.length > 0;
  const inner = hasItems
    ? (() => {
        const rows = substeps
          .map(
            (s, i) =>
              `<tr><td style="padding:6px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;font-weight:bold;width:70px;text-align:center;vertical-align:top;">步骤 ${i + 1}</td><td style="padding:6px;border:1px solid #bfdbfe;background:#fff;word-break:break-word;">${preWrap(s || '—')}</td></tr>`,
          )
          .join('');
        return `<table style="width:100%;border-collapse:collapse;font-size:13px;">${rows}</table>`;
      })()
    : `<span style="color:#94a3b8;font-style:italic;font-size:12px;">（未填写操作子步骤，可在属性面板添加）</span>`;
  return `<tr><td style="padding:6px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-weight:bold;vertical-align:top;">操作子步骤</td><td style="padding:6px;border:1px solid #bfdbfe;background:#fff;">${inner}</td></tr>`;
}

function preWrap(text: string): string {
  // 把换行符渲染为 <br/>，让 Word/打印都能保留多行
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

function buildTocHtml(sop: SopDoc): string {
  const groups = groupForExport(sop);
  if (groups.length === 0) return '';
  const rows = groups
    .flatMap((g) => {
      const parent = `<tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;width:44px;font-weight:bold;color:#1e3a8a;background:#eff6ff;">${g.actionNo}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;width:64px;color:#1e3a8a;background:#eff6ff;font-size:12px;">操作</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;"><a href="#sop-step-${g.actionNo}" style="color:#1e40af;text-decoration:none;font-weight:bold;">${escapeHtml(g.action.title || '未命名步骤')}</a></td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;width:120px;color:#475569;">${escapeHtml(g.action.role || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;width:100px;color:#475569;">${escapeHtml(g.action.time || '—')}</td>
      </tr>`;
      const children = g.decisions
        .map(
          ({ d, localNo }) => `<tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;background:#fffbeb;color:#92400e;font-size:12px;">${g.actionNo}.${localNo}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;color:#92400e;background:#fffbeb;font-size:12px;">判断</td>
        <td style="padding:6px 8px 6px 24px;border:1px solid #e2e8f0;background:#fffbeb;"><a href="#sop-decision-${g.actionNo}-${localNo}" style="color:#92400e;text-decoration:none;">└ ${escapeHtml(d.title || '未命名判断')}</a></td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;background:#fffbeb;color:#475569;">—</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;background:#fffbeb;color:#475569;">—</td>
      </tr>`,
        )
        .join('');
      return [parent, children];
    })
    .join('');
  return `
  <h2 style="background:#f8fafc;color:#0f172a;padding:8px 12px;border-left:4px solid #64748b;margin-top:24px;">目录</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;">序号</th>
        <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;">类型</th>
        <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left;">标题</th>
        <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left;">角色</th>
        <th style="padding:6px 8px;border:1px solid #cbd5e1;text-align:left;">耗时</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function actionStepToWordHtml(step: ActionStep, actionNo: number): string {
  const tools = step.tools?.length ? step.tools.join('、') : '—';
  const risksArr: string[] = step.risks?.length
    ? step.risks
    : step.risk
      ? [step.risk]
      : [];
  const controlsArr: string[] = step.controls?.length
    ? step.controls
    : step.control
      ? [step.control]
      : [];
  const listHtml = (items: string[]): string =>
    items.length === 1
      ? preWrap(items[0])
      : `<ol style="margin:0;padding-left:22px;">${items
          .map(
            (c, i) =>
              `<li><span style="font-weight:bold;margin-right:4px;">${i + 1}.</span>${preWrap(c)}</li>`,
          )
          .join('')}</ol>`;
  const risk =
    risksArr.length > 0
      ? `<tr><td style="padding:6px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-weight:bold;vertical-align:top;">风险点（${risksArr.length}）</td><td style="padding:6px;border:1px solid #fecaca;background:#fff;">${listHtml(risksArr)}</td></tr>`
      : '';
  const control =
    controlsArr.length > 0
      ? `<tr><td style="padding:6px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-weight:bold;vertical-align:top;">管控措施（${controlsArr.length}）</td><td style="padding:6px;border:1px solid #fecaca;background:#fff;">${listHtml(controlsArr)}</td></tr>`
      : '';
  const checklist = step.checklist?.length
    ? `<tr><td style="padding:6px;background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;font-weight:bold;vertical-align:top;">检查清单（${step.checklist.length}）</td><td style="padding:6px;border:1px solid #a7f3d0;background:#fff;"><ol style="margin:0;padding-left:22px;">${step.checklist.map((c, i) => `<li><span style="font-weight:bold;margin-right:4px;">${i + 1}.</span>${preWrap(c)}</li>`).join('')}</ol></td></tr>`
    : `<tr><td style="padding:6px;background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;font-weight:bold;vertical-align:top;">检查清单</td><td style="padding:6px;border:1px solid #a7f3d0;background:#fff;color:#94a3b8;font-style:italic;">（未填写检查清单）</td></tr>`;
  const notes = step.notes?.length
    ? `<tr><td style="padding:6px;background:#f0f9ff;border:1px solid #bae6fd;color:#0369a1;font-weight:bold;vertical-align:top;">备注（${step.notes.length}）</td><td style="padding:6px;border:1px solid #bae6fd;background:#fff;"><ol style="margin:0;padding-left:22px;">${step.notes.map((n, i) => `<li><span style="font-weight:bold;margin-right:4px;">${i + 1}.</span>${preWrap(n)}</li>`).join('')}</ol></td></tr>`
    : `<tr><td style="padding:6px;background:#f0f9ff;border:1px solid #bae6fd;color:#0369a1;font-weight:bold;vertical-align:top;">备注</td><td style="padding:6px;border:1px solid #bae6fd;background:#fff;color:#94a3b8;font-style:italic;">（未填写备注）</td></tr>`;
  return `
    <h2 id="sop-step-${actionNo}" style="background:#eff6ff;color:#1e3a8a;padding:8px 12px;border-left:4px solid #2563eb;margin-top:24px;"><a name="sop-step-${actionNo}"></a>步骤 ${actionNo}：${escapeHtml(step.title)}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed;">
      <colgroup><col style="width:110px;" /><col /></colgroup>
      <tr><td style="padding:6px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;vertical-align:top;">操作说明</td><td style="padding:6px;border:1px solid #e2e8f0;word-break:break-word;">${preWrap(step.content)}</td></tr>
      ${substepsBlock(step.substeps)}
      <tr><td style="padding:6px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;">执行角色</td><td style="padding:6px;border:1px solid #e2e8f0;">${escapeHtml(step.role || '—')}</td></tr>
      <tr><td style="padding:6px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;">预计耗时</td><td style="padding:6px;border:1px solid #e2e8f0;">${escapeHtml(step.time || '—')}</td></tr>
      <tr><td style="padding:6px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;">工具 / 系统</td><td style="padding:6px;border:1px solid #e2e8f0;">${escapeHtml(tools)}</td></tr>
      ${risk}
      ${control}
      ${checklist}
      ${notes}
      ${imagesBlock(step.images, '示例图片', step.imageCaptions)}
    </table>
  `;
}

function decisionStepToWordHtml(
  step: DecisionStep,
  actionNo: number,
  localNo: number,
): string {
  const yesList = step.yesSubsteps ?? [];
  const noList = step.noSubsteps ?? [];
  const branchRow = (
    items: string[],
    label: string,
    bg: string,
    border: string,
    color: string,
  ): string => {
    const body =
      items.length === 0
        ? `<span style="color:#94a3b8;font-style:italic;">（未填写「${label}」路径的操作步骤，可在属性面板的 SubstepsEditor 中添加）</span>`
        : `<table style="width:100%;border-collapse:collapse;font-size:13px;">${items
            .map(
              (s, i) =>
                `<tr><td style="padding:6px;background:${bg};border:1px solid ${border};color:${color};font-weight:bold;width:70px;text-align:center;vertical-align:top;">步骤 ${i + 1}</td><td style="padding:6px;border:1px solid ${border};background:#fff;word-break:break-word;">${preWrap(s || '—')}</td></tr>`,
            )
            .join('')}</table>`;
    return `<tr>
      <td style="padding:6px;background:${bg};border:1px solid ${border};font-weight:bold;vertical-align:top;color:${color};">${label}</td>
      <td style="padding:6px;border:1px solid ${border};word-break:break-word;">${body}</td>
    </tr>`;
  };
  // 判断模块以缩进方式挂在父操作步骤下：无独立"步骤"编号，标题较小
  return `
    <div style="margin-left:24px;margin-top:12px;border-left:3px solid #fde68a;padding-left:16px;">
      <h3 id="sop-decision-${actionNo}-${localNo}" style="background:#fffbeb;color:#92400e;padding:6px 10px;border-radius:4px;margin:8px 0;font-size:14px;"><a name="sop-decision-${actionNo}-${localNo}"></a>判断模块 ${actionNo}.${localNo}：${escapeHtml(step.title)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;">
        <colgroup><col style="width:110px;" /><col /></colgroup>
        <tr><td style="padding:6px;background:#fffbeb;border:1px solid #fde68a;font-weight:bold;vertical-align:top;">判断说明</td><td style="padding:6px;border:1px solid #fde68a;word-break:break-word;">${preWrap(step.content)}</td></tr>
        <tr><td style="padding:6px;background:#fffbeb;border:1px solid #fde68a;font-weight:bold;vertical-align:top;">判断条件</td><td style="padding:6px;border:1px solid #fde68a;word-break:break-word;">${preWrap(step.condition)}</td></tr>
        ${branchRow(yesList, '「是」路径', '#ecfdf5', '#bbf7d0', '#065f46')}
        ${branchRow(noList, '「否」路径', '#fef2f2', '#fecaca', '#991b1b')}
      </table>
    </div>
  `;
}

function buildStepsHtml(sop: SopDoc): string {
  const groups = groupForExport(sop);
  return groups
    .map((g) => {
      const actionHtml = actionStepToWordHtml(g.action, g.actionNo);
      const decisionsHtml = g.decisions
        .map(({ d, localNo }) => decisionStepToWordHtml(d, g.actionNo, localNo))
        .join('\n');
      return `${actionHtml}\n${decisionsHtml}`;
    })
    .join('\n');
}

export function buildWordHtml(sop: SopDoc): string {
  const stepsHtml = buildStepsHtml(sop);
  const tocHtml = buildTocHtml(sop);
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8" />
<meta name="ProgId" content="Word.Document" />
<meta name="Generator" content="Microsoft Word 15" />
<title>${escapeHtml(sop.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotPromptForConvert/></w:WordDocument></xml><![endif]-->
<style>
  /* Word 页面设置：A4，左右页边距 2cm，可用宽度 ~17cm */
  @page Section1 {
    size: 21cm 29.7cm;
    margin: 2cm 2cm 2cm 2cm;
    mso-page-orientation: portrait;
  }
  div.Section1 { page: Section1; }
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #0f172a; line-height: 1.6; }
  h1 { color: #1e3a8a; border-bottom: 3px solid #2563eb; padding-bottom: 8px; }
  table { margin: 8px 0; width: 100%; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
<div class="Section1">
  <h1>${escapeHtml(sop.title)}</h1>
  <p style="color:#475569;">${escapeHtml(sop.desc)}</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;">
    <tr>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;width:25%;">版本</td>
      <td style="padding:6px;border:1px solid #cbd5e1;width:25%;">${escapeHtml(sop.version)}</td>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;width:25%;">负责人</td>
      <td style="padding:6px;border:1px solid #cbd5e1;width:25%;">${escapeHtml(sop.owner)}</td>
    </tr>
    <tr>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;">预计耗时</td>
      <td style="padding:6px;border:1px solid #cbd5e1;">${escapeHtml(sop.duration)}</td>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;">适用场景</td>
      <td style="padding:6px;border:1px solid #cbd5e1;">${escapeHtml(sop.scenario)}</td>
    </tr>
    <tr>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;">状态</td>
      <td style="padding:6px;border:1px solid #cbd5e1;">${escapeHtml(sop.status)}</td>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;">更新日期</td>
      <td style="padding:6px;border:1px solid #cbd5e1;">${escapeHtml(sop.updatedAt)}</td>
    </tr>
  </table>
  ${tocHtml}
  ${stepsHtml}
  <p style="margin-top:32px;color:#94a3b8;font-size:12px;text-align:center;">
    由 LogiFlow SOP 系统生成 · ${new Date().toLocaleString('zh-CN')}
  </p>
</div>
</body>
</html>`;
}

export function downloadWord(sop: SopDoc): void {
  if (typeof window === 'undefined') return;
  const html = buildWordHtml(sop);
  // Word 可识别 application/msword + .doc 的 HTML 文档
  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SOP_${sop.title}_${Date.now()}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildPrintHtml(sop: SopDoc): string {
  const stepsHtml = buildStepsHtml(sop);
  const tocHtml = buildTocHtml(sop);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(sop.title)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  html, body { background: #fff; }
  body {
    font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    line-height: 1.65;
    font-size: 13px;
    margin: 0;
    padding: 24px 28px;
  }
  h1 { color: #1e3a8a; border-bottom: 3px solid #2563eb; padding-bottom: 8px; margin: 0 0 8px; font-size: 22px; }
  h2 { font-size: 15px; margin-top: 18px; page-break-after: avoid; }
  p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; page-break-inside: avoid; }
  td { vertical-align: top; word-break: break-word; }
  img { max-width: 100%; height: auto; }
  .meta { color: #475569; margin-bottom: 12px; }
  /* 打印优化 */
  @media print {
    body { padding: 0; }
    h2 { break-after: avoid-page; }
    table { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
  <h1>${escapeHtml(sop.title)}</h1>
  <p class="meta">${escapeHtml(sop.desc)}</p>
  <table style="font-size:12px;">
    <tr>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;width:18%;">版本</td>
      <td style="padding:6px;border:1px solid #cbd5e1;width:32%;">${escapeHtml(sop.version)}</td>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;width:18%;">负责人</td>
      <td style="padding:6px;border:1px solid #cbd5e1;width:32%;">${escapeHtml(sop.owner)}</td>
    </tr>
    <tr>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;">预计耗时</td>
      <td style="padding:6px;border:1px solid #cbd5e1;">${escapeHtml(sop.duration)}</td>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;">适用场景</td>
      <td style="padding:6px;border:1px solid #cbd5e1;">${escapeHtml(sop.scenario)}</td>
    </tr>
    <tr>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;">状态</td>
      <td style="padding:6px;border:1px solid #cbd5e1;">${escapeHtml(sop.status)}</td>
      <td style="padding:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:bold;">更新日期</td>
      <td style="padding:6px;border:1px solid #cbd5e1;">${escapeHtml(sop.updatedAt)}</td>
    </tr>
  </table>
  ${tocHtml}
  ${stepsHtml}
  <p style="margin-top:24px;color:#94a3b8;font-size:11px;text-align:center;">
    由 LogiFlow SOP 系统生成 · ${new Date().toLocaleString('zh-CN')}
  </p>
</body>
</html>`;
}

// 真·PDF 导出已迁移到 ./export-pdf.ts (html2canvas + jsPDF)。
// 保留 buildPrintHtml 供 PDF 复用；不再提供基于 window.print 的 exportPdf。
