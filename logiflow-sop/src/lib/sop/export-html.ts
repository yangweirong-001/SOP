import type { SopDoc, ActionStep, DecisionStep } from './types';

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// 用户输入的多行文本：转义后把 \n 转成 <br/>，保留手动换行
const preWrap = (s: string): string => escapeHtml(s).replace(/\n/g, '<br/>');

interface Group {
  action: ActionStep;
  actionIdx: number; // 在 sop.steps 中的原索引，用于生成锚点
  actionNo: number; // 只对操作步骤连续编号（用于目录展示）
  decisions: { d: DecisionStep; idx: number; localNo: number }[];
}

function groupForExport(sop: SopDoc): Group[] {
  const groups: Group[] = [];
  let currentGroup: Group | null = null;
  let actionCounter = 0;
  sop.steps.forEach((s, idx) => {
    if (s.type === 'action') {
      actionCounter += 1;
      currentGroup = {
        action: s,
        actionIdx: idx,
        actionNo: actionCounter,
        decisions: [],
      };
      groups.push(currentGroup);
    } else if (currentGroup) {
      currentGroup.decisions.push({
        d: s,
        idx,
        localNo: currentGroup.decisions.length + 1,
      });
    } else {
      // 悬空判断（罕见），单独成组
      groups.push({
        action: {
          id: -idx,
          type: 'action',
          title: '（未挂载操作步骤）',
          content: '',
        } as ActionStep,
        actionIdx: idx,
        actionNo: 0,
        decisions: [{ d: s, idx, localNo: 1 }],
      });
    }
  });
  return groups;
}

function renderActionBody(step: ActionStep): string {
  const notesHtml = (() => {
    const has = step.notes?.length;
    return `<div class="border-t border-slate-100 pt-4 mt-4 bg-sky-50/60 rounded-lg p-4">
        <h4 class="text-sm font-semibold text-sky-700 mb-2 flex items-center gap-1.5">📝 备注 <span class="text-xs font-normal text-sky-500">(${has ?? 0})</span></h4>
        ${has
          ? `<ol class="list-decimal pl-6 text-sm text-slate-700 space-y-1 whitespace-pre-wrap">
              ${step.notes!.map((n, i) => `<li><span class="font-semibold text-sky-700 mr-1">${i + 1}.</span>${preWrap(n)}</li>`).join('')}
            </ol>`
          : `<p class="text-sm text-slate-400 italic">（未填写备注，可在属性面板添加）</p>`}
      </div>`;
  })();

  const checklistHtml = (() => {
    const has = step.checklist?.length;
    return `<div class="border-t border-slate-100 pt-4 mt-4">
        <h4 class="text-sm font-semibold text-slate-700 mb-3">✓ 检查清单 <span class="text-xs font-normal text-slate-400">(${has ?? 0})</span></h4>
        ${has
          ? `<div class="space-y-2">
              ${step.checklist
                .map(
                  (item, i) => `
              <label class="checklist-item flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition cursor-pointer">
                <input type="checkbox" class="w-5 h-5 text-blue-600 rounded border-slate-300" onchange="updateProgress()">
                <span class="text-slate-700"><span class="font-semibold text-slate-500 mr-1">${i + 1}.</span>${preWrap(item)}</span>
              </label>`,
                )
                .join('')}
            </div>`
          : `<p class="text-sm text-slate-400 italic">（未填写检查清单，可在属性面板添加）</p>`}
      </div>`;
  })();

  const imagesHtml = step.images?.length
    ? `<div class="border-t border-slate-100 pt-4 mt-4">
        <h4 class="text-sm font-semibold text-slate-700 mb-3">📷 示例图片</h4>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          ${step.images
            .map((src, ii) => {
              const cap = step.imageCaptions?.[ii] ?? '';
              const capHtml = cap
                ? `<div class="px-2 py-1.5 text-xs text-slate-600 border-t border-slate-100 bg-slate-50/70 whitespace-pre-wrap">${preWrap(cap)}</div>`
                : '';
              return `
          <figure class="block rounded-lg overflow-hidden border border-slate-200 bg-white hover:border-blue-400 transition">
            <a href="${src}" target="_blank" rel="noopener" class="block">
              <img src="${src}" alt="${escapeHtml(cap || `示例 ${ii + 1}`)}" class="w-full h-40 object-contain bg-slate-50" />
            </a>
            <figcaption class="px-2 py-1 text-[11px] text-slate-500 bg-slate-100/60 border-t border-slate-100">图 ${ii + 1}</figcaption>
            ${capHtml}
          </figure>`;
            })
            .join('')}
        </div>
      </div>`
    : '';

  const risks: string[] = step.risks?.length
    ? step.risks
    : step.risk
      ? [step.risk]
      : [];
  const controls: string[] = step.controls?.length
    ? step.controls
    : step.control
      ? [step.control]
      : [];
  const renderList = (items: string[], cls: string): string =>
    items.length === 1
      ? `<div class="text-sm ${cls} mt-1">${preWrap(items[0])}</div>`
      : `<ol class="text-sm ${cls} mt-1 list-decimal list-inside space-y-0.5">${items
          .map(
            (v, i) =>
              `<li><span class="font-semibold mr-1">${i + 1}.</span>${preWrap(v)}</li>`,
          )
          .join('')}</ol>`;
  const riskHtml =
    risks.length > 0 || controls.length > 0
      ? `<div class="mt-4 bg-red-50 border border-red-100 rounded-lg p-4">
        ${risks.length > 0 ? `<div class="text-sm font-medium text-red-800">⚠️ 风险预警（${risks.length}）</div>${renderList(risks, 'text-red-600')}` : ''}
        ${controls.length > 0 ? `<div class="text-sm font-medium text-red-800 mt-2">🛡️ 管控措施（${controls.length}）</div>${renderList(controls, 'text-red-700 font-medium')}` : ''}
      </div>`
      : '';
  const toolsHtml = step.tools?.length
    ? `<div class="bg-slate-50 p-3 rounded-lg col-span-2">
        <span class="text-slate-500 block mb-1 text-xs">使用工具 / 系统</span>
        <span class="font-medium text-slate-700">${escapeHtml(step.tools.join('、'))}</span>
      </div>`
    : '';
  const substepsHtml =
    step.substeps && step.substeps.length > 0
      ? `<div class="mb-4">
          <div class="text-xs font-semibold text-blue-700 mb-2">操作子步骤（共 ${step.substeps.length} 步）</div>
          <ol class="space-y-1.5 list-none">
            ${step.substeps
              .map(
                (s, i) =>
                  `<li class="flex items-start gap-2 text-slate-700"><span class="shrink-0 inline-flex items-center justify-center px-2 h-6 rounded bg-blue-100 text-blue-700 text-xs font-semibold">步骤 ${i + 1}</span><span class="whitespace-pre-wrap">${preWrap(s)}</span></li>`,
              )
              .join('')}
          </ol>
        </div>`
      : '';
  return `
    <p class="text-slate-600 mb-4 leading-relaxed whitespace-pre-wrap">${preWrap(step.content)}</p>
    ${substepsHtml}
    <div class="grid grid-cols-2 gap-3 mb-2 text-sm">
      <div class="bg-slate-50 p-3 rounded-lg">
        <span class="text-slate-500 block mb-1 text-xs">执行角色</span>
        <span class="font-medium text-slate-700">${escapeHtml(step.role || '未指定')}</span>
      </div>
      <div class="bg-slate-50 p-3 rounded-lg">
        <span class="text-slate-500 block mb-1 text-xs">预计耗时</span>
        <span class="font-medium text-slate-700">${escapeHtml(step.time || '未设定')}</span>
      </div>
      ${toolsHtml}
    </div>
    ${checklistHtml}
    ${imagesHtml}
    ${notesHtml}
    ${riskHtml}`;
}

function renderDecisionBlock(d: DecisionStep, localNo: number, anchor: string): string {
  const yesList = d.yesSubsteps ?? [];
  const noList = d.noSubsteps ?? [];
  const branchList = (
    items: string[],
    label: string,
    tone: 'emerald' | 'red',
  ): string => {
    const bg =
      tone === 'emerald'
        ? 'bg-emerald-50 border-emerald-200'
        : 'bg-red-50 border-red-200';
    const chip =
      tone === 'emerald'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-red-100 text-red-700';
    const num =
      tone === 'emerald'
        ? 'bg-emerald-100 text-emerald-700'
        : 'bg-red-100 text-red-700';
    if (items.length === 0) {
      return `<div class="rounded-lg border ${bg} p-3 text-sm text-slate-500 italic"><span class="inline-block px-2 py-0.5 rounded ${chip} font-semibold not-italic mr-1.5">${label}</span>（未填写操作步骤，可在属性面板中添加）</div>`;
    }
    return `<div class="rounded-lg border ${bg} p-3">
      <div class="flex items-center gap-2 mb-2 text-sm font-medium">
        <span class="inline-block px-2 py-0.5 rounded ${chip}">${label}</span>
        <span class="text-slate-500 text-xs">共 ${items.length} 步</span>
      </div>
      <ol class="space-y-1.5 list-none">
        ${items
          .map(
            (s, i) => `<li class="flex items-start gap-2 text-sm">
              <span class="shrink-0 inline-flex items-center justify-center px-2 h-5 rounded ${num} text-xs font-semibold mt-0.5">步骤 ${i + 1}</span>
              <span class="flex-1 whitespace-pre-wrap">${escapeHtml(s || `第 ${i + 1} 步操作`)}</span>
            </li>`,
          )
          .join('')}
      </ol>
    </div>`;
  };
  return `
  <div id="${anchor}" class="ml-4 md:ml-8 relative pl-5 mt-4 scroll-mt-4 before:content-[''] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-0.5 before:bg-amber-200 before:rounded-full">
    <div class="rounded-xl bg-amber-50/70 border border-amber-200 p-5">
      <div class="flex items-center gap-2 mb-3">
        <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">⑂</span>
        <span class="text-[11px] font-semibold uppercase tracking-wider text-amber-700">判断模块 ${localNo}</span>
        <h4 class="text-base font-semibold text-amber-900 flex-1">${escapeHtml(d.title || '未命名判断')}</h4>
      </div>
      ${d.content ? `<p class="text-slate-600 text-sm mb-2 whitespace-pre-wrap">${escapeHtml(d.content)}</p>` : ''}
      ${d.condition ? `<div class="text-sm text-amber-800 bg-white/60 border border-amber-100 rounded-lg px-3 py-2 mb-3"><span class="font-semibold">判断条件：</span>${escapeHtml(d.condition)}</div>` : ''}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${branchList(yesList, '是', 'emerald')}
        ${branchList(noList, '否', 'red')}
      </div>
    </div>
  </div>`;
}

export function buildExportHtml(sop: SopDoc): string {
  const groups = groupForExport(sop);

  const stepsHtml = groups
    .map((g) => {
      const actionAnchor = `step-${g.actionNo}`;
      const actionHtml =
        g.actionNo > 0
          ? `
      <div id="${actionAnchor}" class="step-card bg-white rounded-xl border-l-4 border-blue-500 shadow-sm p-6 scroll-mt-4">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xl shrink-0">${g.actionNo}</div>
          <div class="flex-1">
            <h3 class="text-xl font-semibold text-slate-900 mb-2">${escapeHtml(g.action.title)}</h3>
            ${renderActionBody(g.action)}
          </div>
        </div>
      </div>`
          : '';
      const decisionsHtml = g.decisions
        .map((it) =>
          renderDecisionBlock(it.d, it.localNo, `step-${g.actionNo}-d${it.localNo}`),
        )
        .join('');
      return actionHtml + decisionsHtml;
    })
    .join('\n');

  const tocHtml = `
    <nav class="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-slate-200">
      <div class="flex items-center gap-2 mb-4">
        <div class="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-sm">☰</div>
        <h2 class="text-lg font-semibold text-slate-900">目录</h2>
        <span class="ml-2 text-xs text-slate-500">共 ${groups.filter((g) => g.actionNo > 0).length} 个操作步骤</span>
      </div>
      <ol class="grid gap-1.5 md:grid-cols-2">
        ${groups
          .map((g) => {
            const items: string[] = [];
            if (g.actionNo > 0) {
              const title = escapeHtml(g.action.title || '未命名步骤');
              items.push(`<li>
              <a href="#step-${g.actionNo}" class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-sm text-slate-700 hover:text-blue-700 transition-colors">
                <span class="shrink-0 h-6 w-6 rounded-full text-xs font-semibold flex items-center justify-center ring-1 bg-blue-50 text-blue-700 ring-blue-200">${g.actionNo}</span>
                <span class="flex-1 truncate">${title}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium shrink-0">操作</span>
              </a>
            </li>`);
            }
            g.decisions.forEach((it) => {
              const dtitle = escapeHtml(it.d.title || '未命名判断');
              items.push(`<li>
              <a href="#step-${g.actionNo}-d${it.localNo}" class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-50 text-sm text-slate-600 hover:text-amber-800 transition-colors pl-8">
                <span class="shrink-0 h-5 w-5 rounded-full text-[10px] font-semibold flex items-center justify-center ring-1 bg-amber-50 text-amber-700 ring-amber-200">⑂</span>
                <span class="flex-1 truncate">${dtitle}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium shrink-0">判断</span>
              </a>
            </li>`);
            });
            return items.join('');
          })
          .join('')}
      </ol>
    </nav>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(sop.title)} - SOP</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif; }
    .step-card { transition: all 0.3s; }
    .step-card:hover { transform: translateX(4px); }
    .checklist-item.checked span { text-decoration: line-through; color: #10b981; }
    .progress-bar { transition: width 0.5s ease; }
  </style>
</head>
<body class="bg-slate-50 min-h-screen">
  <div class="max-w-4xl mx-auto p-6">
    <header class="bg-white rounded-2xl shadow-sm p-8 mb-6 border border-slate-200">
      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div class="flex-1 min-w-[260px]">
          <h1 class="text-3xl font-bold text-slate-900 mb-2">${escapeHtml(sop.title)}</h1>
          <p class="text-slate-600">${escapeHtml(sop.desc)}</p>
        </div>
        <div class="text-right text-sm text-slate-500 space-y-1">
          <div>版本：${escapeHtml(sop.version)}</div>
          <div>负责人：${escapeHtml(sop.owner)}</div>
          <div>更新：${escapeHtml(sop.updatedAt)}</div>
        </div>
      </div>
      <div class="w-full bg-slate-200 rounded-full h-2.5 mb-2">
        <div class="bg-blue-600 h-2.5 rounded-full progress-bar" id="progressBar" style="width: 0%"></div>
      </div>
      <div class="flex justify-between text-sm text-slate-500">
        <span>完成进度</span>
        <span id="progressText">0%</span>
      </div>
    </header>
    ${tocHtml}
    <div class="space-y-4">${stepsHtml}</div>
    <footer class="mt-8 text-center text-slate-400 text-sm pb-8">
      由 LogiFlow SOP 系统生成 · 导出时间 ${new Date().toLocaleString('zh-CN')}
    </footer>
  </div>
  <script>
    function updateProgress() {
      const all = document.querySelectorAll('input[type="checkbox"]');
      const checked = document.querySelectorAll('input[type="checkbox"]:checked');
      const total = all.length || 1;
      const percent = Math.round((checked.length / total) * 100);
      document.getElementById('progressBar').style.width = percent + '%';
      document.getElementById('progressText').textContent = percent + '%';
      document.querySelectorAll('.checklist-item').forEach(item => {
        const cb = item.querySelector('input');
        if (cb && cb.checked) item.classList.add('checked');
        else item.classList.remove('checked');
      });
    }
    updateProgress();
  </script>
</body>
</html>`;
}

export function downloadHtml(sop: SopDoc): void {
  if (typeof window === 'undefined') return;
  const html = buildExportHtml(sop);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SOP_${sop.title}_${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
