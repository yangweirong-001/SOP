'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileDown,
  FileText,
  FileType,
  GitBranch,
  GripVertical,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  List,
  ListChecks,
  Pencil,
  Plus,
  Printer,
  Save,
  Send,
  Sparkles,
  Trash2,
  User2,
  Wrench,
  X,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldLabel } from '@/components/sop/FieldLabel';
import { BranchSummary } from '@/components/sop/BranchSummary';
import { SubstepsEditor } from '@/components/sop/SubstepsEditor';
import { StringListEditor } from '@/components/sop/StringListEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DEFAULT_SOPS,
  TEMPLATE_LIB,
} from '@/lib/sop/default-sops';
import {
  loadActiveId,
  loadSops,
  saveActiveId,
  saveSops,
} from '@/lib/sop/storage';
import type {
  ActionStep,
  ChatMessage,
  DecisionStep,
  ProcessType,
  SopDoc,
  SopStep,
} from '@/lib/sop/types';
import { downloadHtml } from '@/lib/sop/export-html';
import { downloadWord } from '@/lib/sop/export-word';
import { exportPdf } from '@/lib/sop/export-pdf';

const PROCESS_TYPE_OPTIONS: Array<{ value: ProcessType; label: string }> = [
  { value: 'inbound', label: '入库流程' },
  { value: 'outbound', label: '出库流程' },
  { value: 'internal', label: '库内作业' },
  { value: 'transport', label: '运输配送' },
  { value: 'exception', label: '异常处理' },
];

const QUICK_PROMPTS: string[] = [
  '优化当前流程',
  '检查风险点',
  '生成培训文档',
  '合规性自检',
];

function makeActionStep(id: number): ActionStep {
  return {
    id,
    type: 'action',
    title: '新操作步骤',
    content: '请输入操作说明……',
    role: '操作员',
    time: '5 分钟',
    tools: [],
    checklist: [],
    images: [],
  };
}

function makeDecisionStep(id: number, parentStepId?: number): DecisionStep {
  return {
    id,
    type: 'decision',
    title: '条件判断',
    content: '描述判断条件……',
    condition: '条件是否满足？',
    yesNext: id + 1,
    noNext: id + 1,
    role: '系统 / 操作员',
    time: '2 分钟',
    parentStepId,
  };
}

export default function LogiFlowEditor(): React.ReactElement {
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [sops, setSops] = useState<SopDoc[]>(DEFAULT_SOPS);
  const [activeId, setActiveId] = useState<string>(DEFAULT_SOPS[0].id);
  const [selectedStepId, setSelectedStepId] = useState<number | null>(null);
  const [agentOpen, setAgentOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [streaming, setStreaming] = useState<boolean>(false);
  const [preview, setPreview] = useState<boolean>(false);
  const [draggingGroupIdx, setDraggingGroupIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    idx: number;
    pos: 'before' | 'after';
  } | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 初始化 hydration
  useEffect(() => {
    const stored = loadSops();
    setSops(stored);
    const id = loadActiveId(stored[0]?.id ?? DEFAULT_SOPS[0].id);
    setActiveId(stored.some((s) => s.id === id) ? id : stored[0].id);
    setHydrated(true);
  }, []);

  // 持久化
  useEffect(() => {
    if (!hydrated) return;
    saveSops(sops);
  }, [sops, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    saveActiveId(activeId);
  }, [activeId, hydrated]);

  // 自动滚动聊天窗口
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const activeSop: SopDoc = useMemo(
    () => sops.find((s) => s.id === activeId) ?? sops[0] ?? DEFAULT_SOPS[0],
    [sops, activeId],
  );

  const updateSop = (updater: (sop: SopDoc) => SopDoc): void => {
    setSops((prev) =>
      prev.map((s) =>
        s.id === activeId
          ? { ...updater(s), updatedAt: new Date().toISOString().slice(0, 10) }
          : s,
      ),
    );
  };

  const updateMeta = (field: keyof SopDoc, value: string): void => {
    updateSop((s) => ({ ...s, [field]: value }) as SopDoc);
  };

  const updateStep = <K extends keyof ActionStep>(
    id: number,
    field: K,
    value: ActionStep[K],
  ): void => {
    updateSop((s) => ({
      ...s,
      steps: s.steps.map((step) =>
        step.id === id ? ({ ...step, [field]: value } as SopStep) : step,
      ),
    }));
  };

  const updateDecision = <K extends keyof DecisionStep>(
    id: number,
    field: K,
    value: DecisionStep[K],
  ): void => {
    updateSop((s) => ({
      ...s,
      steps: s.steps.map((step) =>
        step.id === id && step.type === 'decision'
          ? ({ ...step, [field]: value } as DecisionStep)
          : step,
      ),
    }));
  };

  const addStep = (kind: 'action' | 'decision' = 'action'): void => {
    const newId = Math.max(0, ...activeSop.steps.map((s) => s.id)) + 1;
    updateSop((s) => ({
      ...s,
      steps: [
        ...s.steps,
        kind === 'action' ? makeActionStep(newId) : makeDecisionStep(newId),
      ],
    }));
    setSelectedStepId(newId);
    setTimeout(() => {
      const el = document.querySelector(`[data-step-id="${newId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  /** 在某个 ActionStep 下方挂载一个新的判断节点 */
  const addDecisionUnder = (parentActionId: number): void => {
    const newId = Math.max(0, ...activeSop.steps.map((s) => s.id)) + 1;
    updateSop((s) => {
      // 找到 parent 及其已挂载的最后一个判断节点位置
      const idx = s.steps.findIndex((st) => st.id === parentActionId);
      if (idx < 0) return s;
      let insertAt = idx + 1;
      while (
        insertAt < s.steps.length &&
        s.steps[insertAt].type === 'decision' &&
        (s.steps[insertAt] as DecisionStep).parentStepId === parentActionId
      ) {
        insertAt += 1;
      }
      const next = [...s.steps];
      next.splice(insertAt, 0, makeDecisionStep(newId, parentActionId));
      return { ...s, steps: next };
    });
    setSelectedStepId(newId);
    setTimeout(() => {
      const el = document.querySelector(`[data-step-id="${newId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const deleteStep = (id: number): void => {
    updateSop((s) => {
      // 删除 ActionStep 时连带其挂载的所有 DecisionStep 一起删
      const target = s.steps.find((st) => st.id === id);
      if (target?.type === 'action') {
        return {
          ...s,
          steps: s.steps.filter(
            (st) =>
              st.id !== id &&
              !(st.type === 'decision' && (st as DecisionStep).parentStepId === id),
          ),
        };
      }
      return { ...s, steps: s.steps.filter((st) => st.id !== id) };
    });
    if (selectedStepId === id) setSelectedStepId(null);
    toast.success('已删除步骤');
  };

  /**
   * 把 steps 按 ActionStep + 挂载的 DecisionStep 分组
   * 返回 [{ head: ActionStep|DecisionStep, group: SopStep[] }]
   */
  const groupSteps = (steps: SopStep[]): SopStep[][] => {
    const groups: SopStep[][] = [];
    let current: SopStep[] | null = null;
    for (const st of steps) {
      if (st.type === 'action') {
        if (current) groups.push(current);
        current = [st];
      } else {
        const dec = st as DecisionStep;
        if (
          current &&
          current[0].type === 'action' &&
          dec.parentStepId === current[0].id
        ) {
          current.push(dec);
        } else {
          // 悬空判断（无 parent 或 parent 不在前）作为独立组
          if (current) groups.push(current);
          current = [st];
        }
      }
    }
    if (current) groups.push(current);
    return groups;
  };

  /** 拖拽整组：把 groups[fromIdx] 移到 targetIdx 位置 */
  const moveStepGroup = (fromIdx: number, targetIdx: number): void => {
    updateSop((s) => {
      const groups = groupSteps(s.steps);
      if (fromIdx < 0 || fromIdx >= groups.length) return s;
      if (targetIdx < 0 || targetIdx > groups.length) return s;
      const moving = groups[fromIdx];
      const rest = groups.filter((_, i) => i !== fromIdx);
      const insertAt = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
      rest.splice(insertAt, 0, moving);
      return { ...s, steps: rest.flat() };
    });
  };

  const moveStep = (index: number, direction: -1 | 1): void => {
    updateSop((s) => {
      const groups = groupSteps(s.steps);
      // 找到 index 对应哪个 group
      let gIdx = -1;
      let localOffset = 0;
      let acc = 0;
      for (let i = 0; i < groups.length; i += 1) {
        if (index < acc + groups[i].length) {
          gIdx = i;
          localOffset = index - acc;
          break;
        }
        acc += groups[i].length;
      }
      if (gIdx < 0) return s;
      // 如果拖动 ActionStep（组头），整组移动
      if (localOffset === 0) {
        const target = gIdx + direction;
        if (target < 0 || target >= groups.length) return s;
        [groups[gIdx], groups[target]] = [groups[target], groups[gIdx]];
        return { ...s, steps: groups.flat() };
      }
      // 组内 DecisionStep 相对移动
      const group = [...groups[gIdx]];
      const target = localOffset + direction;
      if (target < 1 || target >= group.length) return s;
      [group[localOffset], group[target]] = [group[target], group[localOffset]];
      groups[gIdx] = group;
      return { ...s, steps: groups.flat() };
    });
  };

  const addChecklistItem = (stepId: number): void => {
    updateSop((s) => ({
      ...s,
      steps: s.steps.map((step) => {
        if (step.id === stepId && step.type === 'action') {
          return { ...step, checklist: [...step.checklist, '新检查项'] };
        }
        return step;
      }),
    }));
  };

  const updateChecklistItem = (
    stepId: number,
    idx: number,
    value: string,
  ): void => {
    updateSop((s) => ({
      ...s,
      steps: s.steps.map((step) => {
        if (step.id === stepId && step.type === 'action') {
          const list = [...step.checklist];
          list[idx] = value;
          return { ...step, checklist: list };
        }
        return step;
      }),
    }));
  };

  const removeChecklistItem = (stepId: number, idx: number): void => {
    updateSop((s) => ({
      ...s,
      steps: s.steps.map((step) => {
        if (step.id === stepId && step.type === 'action') {
          return {
            ...step,
            checklist: step.checklist.filter((_, i) => i !== idx),
          };
        }
        return step;
      }),
    }));
  };

  const createNewSop = (): void => {
    const name = window.prompt('请输入新 SOP 名称：', '新的物流流程');
    if (!name) return;
    const id = 'sop_' + Date.now();
    const newSop: SopDoc = {
      id,
      title: name,
      desc: '',
      type: 'inbound',
      owner: '未指定',
      duration: '待评估',
      scenario: '通用',
      version: 'V0.1',
      status: '草稿',
      updatedAt: new Date().toISOString().slice(0, 10),
      steps: [],
    };
    setSops((prev) => [...prev, newSop]);
    setActiveId(id);
    setSelectedStepId(null);
    toast.success(`已创建：${name}`);
  };

  const loadTemplate = (templateId: string): void => {
    const tpl = TEMPLATE_LIB.find((t) => t.id === templateId);
    if (!tpl) return;
    const generated = tpl.generate();
    setSops((prev) => [...prev, generated]);
    setActiveId(generated.id);
    setSelectedStepId(null);
    toast.success(`已加载模板：${tpl.name}`);
  };

  const deleteSop = (id: string): void => {
    if (sops.length <= 1) {
      toast.warning('至少需要保留一个 SOP');
      return;
    }
    if (!window.confirm('确认删除此 SOP？该操作不可撤销。')) return;
    setSops((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) {
      const fallback = sops.find((s) => s.id !== id);
      if (fallback) setActiveId(fallback.id);
    }
    toast.success('已删除 SOP');
  };

  const handleSave = (): void => {
    saveSops(sops);
    toast.success('已保存到本地存储');
  };

  const handleExportHtml = (): void => {
    downloadHtml(activeSop);
    toast.success('已开始导出 HTML');
  };

  const handleExportWord = (): void => {
    downloadWord(activeSop);
    toast.success('已开始导出 Word（.doc）');
  };

  const handleExportPdf = (): void => {
    const t = toast.loading('正在准备打印预览...');
    exportPdf(activeSop)
      .then(() => {
        toast.success('已打开打印预览，请在弹窗中选择"另存为 PDF"', { id: t });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`导出 PDF 失败：${msg}`, { id: t });
      });
  };

  const addImagesToStep = (stepId: number, srcs: string[]): void => {
    if (srcs.length === 0) return;
    updateSop((s) => ({
      ...s,
      steps: s.steps.map((step) => {
        if (step.id === stepId && step.type === 'action') {
          const existing = step.images ?? [];
          const existingCaps = step.imageCaptions ?? [];
          const merged = [...existing, ...srcs].slice(0, 12);
          const mergedCaps = [...existingCaps, ...srcs.map(() => '')].slice(
            0,
            12,
          );
          return { ...step, images: merged, imageCaptions: mergedCaps };
        }
        return step;
      }),
    }));
    toast.success(`已添加 ${srcs.length} 张图片`);
  };

  const removeImageFromStep = (stepId: number, idx: number): void => {
    updateSop((s) => ({
      ...s,
      steps: s.steps.map((step) => {
        if (step.id === stepId && step.type === 'action') {
          const list = [...(step.images ?? [])];
          const caps = [...(step.imageCaptions ?? [])];
          list.splice(idx, 1);
          caps.splice(idx, 1);
          return { ...step, images: list, imageCaptions: caps };
        }
        return step;
      }),
    }));
  };

  const updateImageCaption = (
    stepId: number,
    idx: number,
    caption: string,
  ): void => {
    updateSop((s) => ({
      ...s,
      steps: s.steps.map((step) => {
        if (step.id === stepId && step.type === 'action') {
          const caps = [...(step.imageCaptions ?? [])];
          while (caps.length < (step.images ?? []).length) caps.push('');
          caps[idx] = caption;
          return { ...step, imageCaptions: caps };
        }
        return step;
      }),
    }));
  };

  const selectedStep: SopStep | undefined = activeSop.steps.find(
    (s) => s.id === selectedStepId,
  );

  // ===== AI Agent =====
  const sendAgentMessage = async (text?: string): Promise<void> => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setInput('');
    const userMsg: ChatMessage = {
      id: 'u_' + Date.now(),
      role: 'user',
      content,
    };
    const assistantId = 'a_' + Date.now();
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const chatApi =
        (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CHAT_API_URL) ||
        (typeof window !== 'undefined' && window.localStorage.getItem('logiflow.chatApi')) ||
        '/api/chat';
      const res = await fetch(chatApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          sopSnapshot: JSON.stringify({
            title: activeSop.title,
            desc: activeSop.desc,
            type: activeSop.type,
            steps: activeSop.steps,
          }).slice(0, 6000),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error('请求失败：' + res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const obj = JSON.parse(payload) as {
              type: string;
              content?: string;
              error?: string;
            };
            if (obj.type === 'delta' && obj.content) {
              acc += obj.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: acc, pending: true }
                    : m,
                ),
              );
            } else if (obj.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, pending: false } : m,
                ),
              );
            } else if (obj.type === 'error') {
              throw new Error(obj.error || 'LLM 错误');
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes('LLM')) throw e;
            // ignore parse error
          }
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, pending: false } : m,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  (m.content ? m.content + '\n\n' : '') +
                  `⚠️ ${message}，请稍后重试。`,
                pending: false,
              }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="flex items-center gap-3 text-sm">
          <Sparkles className="h-4 w-4 animate-pulse text-blue-600" />
          正在加载 LogiFlow SOP……
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-800 overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-30 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-blue-200">
            L
          </div>
          <div>
            <h1 className="font-bold text-base text-slate-900 leading-tight">
              LogiFlow SOP
            </h1>
            <p className="text-xs text-slate-500 leading-tight">
              物流标准作业程序智能平台
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5 text-xs">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-slate-500">当前项目：</span>
            <span className="font-medium text-slate-900 max-w-[180px] truncate">
              {activeSop.title}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreview((v) => !v)}
            className="gap-1.5"
          >
            <Eye className="h-4 w-4" />
            {preview ? '退出预览' : '预览模式'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="bg-slate-900 hover:bg-slate-800 gap-1.5"
              >
                <FileDown className="h-4 w-4" />
                导出
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={handleExportHtml} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4 text-blue-600" />
                <div className="flex flex-col">
                  <span>导出为 HTML</span>
                  <span className="text-xs text-slate-500">网页，可分享</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportWord} className="gap-2 cursor-pointer">
                <FileType className="h-4 w-4 text-indigo-600" />
                <div className="flex flex-col">
                  <span>导出为 Word</span>
                  <span className="text-xs text-slate-500">.doc，可继续编辑</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportPdf} className="gap-2 cursor-pointer">
                <Printer className="h-4 w-4 text-rose-600" />
                <div className="flex flex-col">
                  <span>导出为 PDF</span>
                  <span className="text-xs text-slate-500">打印预览另存</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden">
          <div className="p-4 overflow-y-auto flex-1">
            <Button
              onClick={createNewSop}
              className="w-full mb-4 gap-1.5 bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              新建 SOP 流程
            </Button>

            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
              我的 SOP 库
            </div>
            <nav className="space-y-1 mb-6">
              {sops.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveId(s.id);
                    setSelectedStepId(null);
                  }}
                  className={cn(
                    'group w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition flex items-center justify-between gap-2',
                    s.id === activeId
                      ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600 pl-2'
                      : 'text-slate-600 hover:bg-slate-50 border-l-4 border-transparent pl-2',
                  )}
                >
                  <span className="truncate flex-1">{s.title}</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'text-xs font-normal',
                      s.id === activeId
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {s.steps.length}步
                  </Badge>
                </button>
              ))}
            </nav>

            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
              模板市场
            </div>
            <div className="space-y-2">
              {TEMPLATE_LIB.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => loadTemplate(tpl.id)}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40 transition"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{tpl.emoji}</span>
                    <span className="text-sm font-medium text-slate-700">
                      {tpl.name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{tpl.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto p-4 border-t border-slate-200 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                AI
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700">
                  SOP 智能助手
                </div>
                <div className="text-xs text-slate-500">
                  {streaming ? '思考中…' : '点击右下角悬浮按钮唤起'}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main canvas */}
        <main className="flex-1 flex flex-col bg-slate-50 overflow-hidden min-w-0">
          <div className="h-14 bg-white border-b border-slate-200 flex items-center px-6 justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">流程类型：</span>
                <Select
                  value={activeSop.type}
                  onValueChange={(v) => updateMeta('type', v)}
                >
                  <SelectTrigger className="h-8 w-[140px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROCESS_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => addStep('action')}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                添加步骤
              </Button>
              <span className="hidden md:inline text-[11px] text-slate-400 ml-1">
                （判断节点请在步骤卡片右上角
                <GitBranch className="inline-block h-3 w-3 mx-0.5 text-amber-500 align-text-bottom" />
                添加）
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteSop(activeId)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除当前 SOP
              </Button>
              <Button onClick={handleSave} size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                <Save className="h-3.5 w-3.5" />
                保存
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-3xl mx-auto">
              {/* SOP meta card */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 shadow-sm">
                <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Pencil className="h-3 w-3" />
                  SOP 基本信息（所有字段均可点击编辑）
                </div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <Input
                      value={activeSop.title}
                      onChange={(e) => updateMeta('title', e.target.value)}
                      className="text-xl md:text-2xl font-bold text-slate-900 w-full border border-transparent hover:border-slate-200 hover:bg-slate-50/60 focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:border-blue-300 focus-visible:bg-white rounded-md px-2 -mx-2 h-auto py-1 bg-transparent shadow-none transition"
                      placeholder="输入 SOP 标题……"
                    />
                    <Textarea
                      value={activeSop.desc}
                      onChange={(e) => updateMeta('desc', e.target.value)}
                      rows={2}
                      className="mt-2 text-sm text-slate-600 border border-transparent hover:border-slate-200 hover:bg-slate-50/60 focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:border-blue-300 focus-visible:bg-white rounded-md px-2 -mx-2 resize-none bg-transparent shadow-none transition"
                      placeholder="输入 SOP 描述……"
                    />
                  </div>
                  <div className="flex flex-col gap-2 items-end shrink-0 min-w-[110px]">
                    <Select
                      value={activeSop.status}
                      onValueChange={(v) => updateMeta('status', v)}
                    >
                      <SelectTrigger className="h-7 w-[110px] text-xs font-medium bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 focus:ring-emerald-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="草稿">草稿</SelectItem>
                        <SelectItem value="审核中">审核中</SelectItem>
                        <SelectItem value="已发布">已发布</SelectItem>
                        <SelectItem value="已启用">已启用</SelectItem>
                        <SelectItem value="已归档">已归档</SelectItem>
                        <SelectItem value="已停用">已停用</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-md px-2 h-7 transition">
                      <span className="text-[10px] text-blue-600 font-medium">版本</span>
                      <Input
                        value={activeSop.version}
                        onChange={(e) => updateMeta('version', e.target.value)}
                        className="h-6 w-[60px] px-1 text-xs font-medium text-blue-700 bg-transparent border-none focus-visible:ring-0 shadow-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                  {[
                    { label: '负责人', field: 'owner' as const },
                    { label: '预计耗时', field: 'duration' as const },
                    { label: '适用场景', field: 'scenario' as const },
                    { label: '更新日期', field: 'updatedAt' as const },
                  ].map((meta) => (
                    <div key={meta.field}>
                      <div className="text-xs text-slate-500 mb-1">
                        {meta.label}
                      </div>
                      <Input
                        type={meta.field === 'updatedAt' ? 'date' : 'text'}
                        value={activeSop[meta.field]}
                        onChange={(e) => updateMeta(meta.field, e.target.value)}
                        className="text-sm font-medium text-slate-700 w-full border border-transparent hover:border-slate-200 hover:bg-slate-50/60 focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:border-blue-300 focus-visible:bg-white rounded-md px-2 -mx-2 h-8 bg-transparent shadow-none transition"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Outline / Table of contents */}
              <SopOutline
                steps={activeSop.steps}
                selectedStepId={selectedStepId}
                onSelect={(id) => {
                  setSelectedStepId(id);
                  requestAnimationFrame(() => {
                    document
                      .getElementById(`step-anchor-${id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  });
                }}
              />

              {/* Flow steps */}
              <div className="space-y-6 relative pb-10">
                {activeSop.steps.length === 0 ? (
                  <div className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-12 text-center text-slate-500">
                    <Layers className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="text-sm">还没有任何步骤</p>
                    <p className="text-xs mt-1 text-slate-400">
                      点击下方按钮添加第一个步骤
                    </p>
                  </div>
                ) : (
                  (() => {
                    const groups = groupSteps(activeSop.steps);
                    let flatCounter = 0;
                    return groups.map((group, groupIdx) => {
                      const headFlatIdx = flatCounter;
                      const nodes = group.map((step, localIdx) => {
                        const flatIdx = flatCounter;
                        flatCounter += 1;
                        return { step, flatIdx, localIdx };
                      });
                      const head = nodes[0];
                      const decisions = nodes.slice(1);
                      const isDragging = draggingGroupIdx === groupIdx;
                      const showBefore =
                        dropTarget?.idx === groupIdx && dropTarget.pos === 'before';
                      const showAfter =
                        dropTarget?.idx === groupIdx && dropTarget.pos === 'after';
                      return (
                        <div
                          key={group[0].id}
                          data-group-idx={groupIdx}
                          onDragOver={(e) => {
                            if (draggingGroupIdx == null) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            const rect = e.currentTarget.getBoundingClientRect();
                            const y = e.clientY - rect.top;
                            setDropTarget({
                              idx: groupIdx,
                              pos: y < rect.height / 2 ? 'before' : 'after',
                            });
                          }}
                          onDragLeave={(e) => {
                            // 只有真正离开容器时才清空
                            const related = e.relatedTarget as Node | null;
                            if (!related || !e.currentTarget.contains(related)) {
                              // don't clear immediately, next onDragOver will re-set
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggingGroupIdx == null || dropTarget == null) return;
                            const targetIdx =
                              dropTarget.pos === 'after'
                                ? dropTarget.idx + 1
                                : dropTarget.idx;
                            if (
                              targetIdx !== draggingGroupIdx &&
                              targetIdx !== draggingGroupIdx + 1
                            ) {
                              moveStepGroup(draggingGroupIdx, targetIdx);
                            }
                            setDraggingGroupIdx(null);
                            setDropTarget(null);
                          }}
                          className={cn(
                            'relative transition-opacity',
                            isDragging && 'opacity-40',
                          )}
                        >
                          {showBefore && (
                            <div className="absolute -top-3 left-0 right-0 h-1 bg-blue-500 rounded-full shadow-lg z-10 pointer-events-none" />
                          )}

                          {/* Head (ActionStep or 悬空 DecisionStep) */}
                          <div
                            draggable
                            onDragStart={(e) => {
                              setDraggingGroupIdx(groupIdx);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', String(groupIdx));
                            }}
                            onDragEnd={() => {
                              setDraggingGroupIdx(null);
                              setDropTarget(null);
                            }}
                            className="cursor-move"
                          >
                            <StepCardView
                              step={head.step}
                              index={head.flatIdx}
                              total={activeSop.steps.length}
                              selected={selectedStepId === head.step.id}
                              onSelect={() => setSelectedStepId(head.step.id)}
                              onMove={(dir) => moveStep(head.flatIdx, dir)}
                              onDelete={() => deleteStep(head.step.id)}
                              onAddDecision={
                                head.step.type === 'action'
                                  ? () => addDecisionUnder(head.step.id)
                                  : undefined
                              }
                              draggable
                            />
                          </div>

                          {/* Nested decisions under this action */}
                          {decisions.length > 0 && (
                            <div className="mt-3 ml-10 pl-6 border-l-2 border-dashed border-amber-300 space-y-3 relative">
                              <div className="absolute -left-[9px] top-2 w-4 h-4 rounded-full bg-amber-100 border-2 border-amber-300" />
                              {decisions.map(({ step, flatIdx }) => (
                                <StepCardView
                                  key={step.id}
                                  step={step}
                                  index={flatIdx}
                                  total={activeSop.steps.length}
                                  selected={selectedStepId === step.id}
                                  onSelect={() => setSelectedStepId(step.id)}
                                  onMove={(dir) => moveStep(flatIdx, dir)}
                                  onDelete={() => deleteStep(step.id)}
                                  nested
                                />
                              ))}
                            </div>
                          )}

                          {showAfter && (
                            <div className="absolute -bottom-3 left-0 right-0 h-1 bg-blue-500 rounded-full shadow-lg z-10 pointer-events-none" />
                          )}
                          {/* 抑制未使用变量警告 */}
                          {headFlatIdx < 0 && null}
                        </div>
                      );
                    });
                  })()
                )}

                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => addStep('action')}
                    className="group flex items-center gap-2 px-6 py-3 bg-white border-2 border-dashed border-slate-300 rounded-xl hover:border-blue-400 hover:bg-blue-50/40 transition"
                  >
                    <Plus className="h-5 w-5 text-slate-400 group-hover:text-blue-500" />
                    <span className="text-sm font-medium text-slate-500 group-hover:text-blue-600">
                      添加新步骤
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Property panel */}
        {!preview && (
          <aside className="w-80 bg-white border-l border-slate-200 flex flex-col overflow-hidden shrink-0">
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 shrink-0">
              <h3 className="font-semibold text-slate-900 text-sm">步骤详情</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedStep
                  ? '在此编辑选中步骤的详细字段'
                  : '点击左侧步骤进行编辑'}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!selectedStep ? (
                <div className="text-center text-slate-400 py-12">
                  <ListChecks className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm">
                    点击流程中的步骤
                    <br />
                    查看和编辑详细信息
                  </p>
                </div>
              ) : selectedStep.type === 'action' ? (
                <ActionStepEditor
                  step={selectedStep}
                  onChange={(field, value) =>
                    updateStep(selectedStep.id, field, value)
                  }
                  onChecklistAdd={() => addChecklistItem(selectedStep.id)}
                  onChecklistUpdate={(i, v) =>
                    updateChecklistItem(selectedStep.id, i, v)
                  }
                  onChecklistRemove={(i) =>
                    removeChecklistItem(selectedStep.id, i)
                  }
                  onImagesAdd={(srcs) => addImagesToStep(selectedStep.id, srcs)}
                  onImageRemove={(i) => removeImageFromStep(selectedStep.id, i)}
                  onImageCaptionChange={(i, cap) =>
                    updateImageCaption(selectedStep.id, i, cap)
                  }
                  onDelete={() => deleteStep(selectedStep.id)}
                />
              ) : (
                <DecisionStepEditor
                  step={selectedStep}
                  onChange={(field, value) =>
                    updateDecision(selectedStep.id, field, value)
                  }
                  onDelete={() => deleteStep(selectedStep.id)}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Agent button & window */}
      {!agentOpen && (
        <button
          onClick={() => setAgentOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-full shadow-lg shadow-blue-300/40 hover:shadow-xl hover:scale-105 transition flex items-center justify-center z-40 agent-pulse"
          aria-label="打开 AI 助手"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {agentOpen && (
        <div className="fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden z-40" style={{ height: 540 }}>
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-white font-semibold text-sm">LogiAgent</h4>
                <p className="text-blue-100 text-xs">物流 SOP 智能助手</p>
              </div>
            </div>
            <button
              onClick={() => setAgentOpen(false)}
              className="text-white/80 hover:text-white transition"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50"
          >
            {messages.length === 0 && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  AI
                </div>
                <div className="bg-white rounded-2xl rounded-tl-none p-3 shadow-sm border border-slate-100 max-w-[85%]">
                  <p className="text-sm text-slate-700">
                    你好！我是你的物流 SOP 智能助手，可以帮你：
                  </p>
                  <ul className="text-sm text-slate-600 mt-2 space-y-1 list-disc list-inside">
                    <li>优化现有流程步骤</li>
                    <li>识别风险与合规缺口</li>
                    <li>生成培训文档 / 检查清单</li>
                    <li>对照行业规范给出量化建议</li>
                  </ul>
                  <p className="text-xs text-slate-500 mt-2">
                    试试问我：&ldquo;如何优化入库质检环节？&rdquo;
                  </p>
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex gap-3 justify-end">
                  <div className="bg-blue-600 text-white rounded-2xl rounded-tr-none p-3 shadow-sm max-w-[85%]">
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {m.content}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold shrink-0">
                    我
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    AI
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-none p-3 shadow-sm border border-slate-100 max-w-[85%]">
                    {m.content ? (
                      <p className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                        {m.content}
                        {m.pending && (
                          <span className="inline-block w-1.5 h-3.5 align-middle ml-0.5 bg-slate-400 animate-pulse" />
                        )}
                      </p>
                    ) : (
                      <div className="flex gap-1 py-1">
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full typing-dot" />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full typing-dot" />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full typing-dot" />
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="p-3 bg-white border-t border-slate-200 shrink-0">
            <div className="flex gap-2 mb-2 overflow-x-auto scrollbar-none">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendAgentMessage(q)}
                  disabled={streaming}
                  className="whitespace-nowrap px-3 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-full text-xs transition disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendAgentMessage();
                  }
                }}
                placeholder={streaming ? '思考中…' : '输入问题或指令…'}
                disabled={streaming}
                className="flex-1 bg-slate-100 border-0 rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-blue-500"
              />
              <Button
                onClick={() => void sendAgentMessage()}
                disabled={streaming || !input.trim()}
                size="icon"
                className="rounded-xl bg-blue-600 hover:bg-blue-700"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Sub components are defined in next edit =====
// Placeholder to satisfy compiler before edit_file appends
function SopOutline(props: {
  steps: SopStep[];
  selectedStepId: number | null;
  onSelect: (id: number) => void;
}): React.ReactElement | null {
  const { steps, selectedStepId, onSelect } = props;
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;
  const actionCount = steps.filter((s) => s.type === 'action').length;
  const decisionCount = steps.length - actionCount;
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white">
            <List className="h-4 w-4" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-900 leading-tight">
              目录
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              共 {steps.length} 项 · 操作 {actionCount} · 判断 {decisionCount}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-500 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <ol className="border-t border-slate-100 divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {steps.map((step, idx) => {
            const isDecision = step.type === 'decision';
            const selected = selectedStepId === step.id;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => onSelect(step.id)}
                  className={`w-full text-left flex items-start gap-3 px-5 py-2.5 hover:bg-slate-50 transition-colors ${
                    selected ? 'bg-blue-50/60' : ''
                  }`}
                >
                  <span
                    className={`shrink-0 mt-0.5 h-6 w-6 rounded-full text-xs font-semibold flex items-center justify-center ${
                      isDecision
                        ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
                        : 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium truncate ${
                        selected ? 'text-blue-700' : 'text-slate-900'
                      }`}
                    >
                      {step.title || (isDecision ? '未命名判断' : '未命名步骤')}
                    </div>
                    {step.type === 'action' && step.role && (
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {step.role}
                        {step.time ? ` · ${step.time}` : ''}
                      </div>
                    )}
                  </div>
                  <span
                    className={`shrink-0 mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      isDecision
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {isDecision ? '判断' : '操作'}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function StepCardView(props: {
  step: SopStep;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onAddDecision?: () => void;
  nested?: boolean;
  draggable?: boolean;
}): React.ReactElement {
  const {
    step,
    index,
    total,
    selected,
    onSelect,
    onMove,
    onDelete,
    onAddDecision,
    nested,
    draggable,
  } = props;
  return (
    <div
      id={`step-anchor-${step.id}`}
      className="relative scroll-mt-24"
      data-step-id={step.id}
    >
      {index > 0 && !nested && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-6 w-0.5 h-6 bg-gradient-to-b from-blue-400 to-indigo-400" />
      )}
      {step.type === 'action' ? (
        <ActionCard
          step={step}
          index={index}
          selected={selected}
          onSelect={onSelect}
        >
          <CardControls
            index={index}
            total={total}
            onMove={onMove}
            onDelete={onDelete}
            onAddDecision={onAddDecision}
            draggable={draggable}
          />
        </ActionCard>
      ) : (
        <DecisionCard
          step={step}
          selected={selected}
          onSelect={onSelect}
        >
          <CardControls
            index={index}
            total={total}
            onMove={onMove}
            onDelete={onDelete}
          />
        </DecisionCard>
      )}
    </div>
  );
}

function CardControls(props: {
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onAddDecision?: () => void;
  draggable?: boolean;
}): React.ReactElement {
  const { index, total, onMove, onDelete, onAddDecision, draggable } = props;
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {draggable && (
        <div
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-move"
          aria-label="拖拽移动"
          title="按住拖拽整组移动"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMove(-1);
        }}
        disabled={index === 0}
        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="上移"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMove(1);
        }}
        disabled={index === total - 1}
        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="下移"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
        aria-label="删除"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      {onAddDecision && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddDecision();
          }}
          className="p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50"
          aria-label="添加判断节点"
          title="在此步骤下添加判断节点"
        >
          <GitBranch className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function ActionCard(props: {
  step: ActionStep;
  index: number;
  selected: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
}): React.ReactElement {
  const { step, index, selected, onSelect, children } = props;
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flow-node bg-white rounded-xl border-2 p-5 cursor-pointer relative transition',
        selected
          ? 'border-blue-500 ring-4 ring-blue-100'
          : 'border-slate-200 hover:border-blue-300',
      )}
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base shrink-0 border border-blue-100">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0 pr-8">
          <div className="flex items-center justify-between mb-1 gap-2">
            <h3 className="font-semibold text-slate-900 text-base truncate">
              {step.title}
            </h3>
            <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal shrink-0">
              <Clock className="w-3 h-3 mr-1" />
              {step.time}
            </Badge>
          </div>
          <p className="text-sm text-slate-600 line-clamp-3 mb-3 leading-relaxed whitespace-pre-wrap break-words">
            {step.content}
          </p>
          {step.substeps && step.substeps.length > 0 && (
            <ol className="mb-3 space-y-1 text-sm text-slate-700 list-none">
              {step.substeps.slice(0, 4).map((s, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold mt-0.5">
                    {i + 1}
                  </span>
                  <span className="line-clamp-1 break-all">{s}</span>
                </li>
              ))}
              {step.substeps.length > 4 && (
                <li className="text-xs text-slate-400 pl-7">
                  …还有 {step.substeps.length - 4} 条子步骤
                </li>
              )}
            </ol>
          )}
          {step.images && step.images.length > 0 && (
            <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-none pb-1">
              {step.images.slice(0, 4).map((src, i) => {
                const cap = step.imageCaptions?.[i] ?? '';
                return (
                  <div
                    key={i}
                    className="relative w-14 h-14 rounded-md overflow-hidden border border-slate-200 bg-slate-50 shrink-0"
                    title={cap || `示例 ${i + 1}`}
                  >
                    <img
                      src={src}
                      alt={cap || `示例 ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {cap ? (
                      <div className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[9px] leading-tight px-1 py-0.5 truncate">
                        {cap}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {step.images.length > 4 && (
                <div className="w-14 h-14 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center text-xs text-slate-500 shrink-0">
                  +{step.images.length - 4}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1 text-slate-500">
              <User2 className="w-3.5 h-3.5" />
              {step.role}
            </span>
            {step.tools && step.tools.length > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-500 min-w-0">
                <Wrench className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[200px]">
                  {step.tools.join('、')}
                </span>
              </span>
            )}
            {(step.risks?.length ?? 0) > 0 && (
              <span
                className="inline-flex items-center gap-1 text-red-600"
                title={step.risks?.join(' / ')}
              >
                <Boxes className="w-3.5 h-3.5" />
                {step.risks!.length === 1 ? '1 项风险' : `${step.risks!.length} 项风险`}
              </span>
            )}
            {step.images && step.images.length > 0 && (
              <span className="inline-flex items-center gap-1 text-indigo-600">
                <ImageIcon className="w-3.5 h-3.5" />
                {step.images.length} 张图
              </span>
            )}
            {(step.notes?.length ?? 0) > 0 && (
              <span
                className="inline-flex items-center gap-1 text-sky-600"
                title={step.notes?.join(' / ')}
              >
                <FileText className="w-3.5 h-3.5" />
                {step.notes!.length === 1 ? '1 条备注' : `${step.notes!.length} 条备注`}
              </span>
            )}
            {step.checklist && step.checklist.length > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {step.checklist.length} 项检查
              </span>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function DecisionCard(props: {
  step: DecisionStep;
  selected: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
}): React.ReactElement {
  const { step, selected, onSelect, children } = props;
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flow-node bg-amber-50/40 rounded-xl border-2 p-5 cursor-pointer relative transition',
        selected
          ? 'border-amber-500 ring-4 ring-amber-100'
          : 'border-amber-200 hover:border-amber-400',
      )}
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
          <HelpCircle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 pr-8">
          <div className="flex items-center justify-between mb-1 gap-2">
            <h3 className="font-semibold text-amber-800 text-base truncate">
              {step.title}
            </h3>
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 font-normal shrink-0">
              判断节点
            </Badge>
          </div>
          <p className="text-sm text-slate-700 mb-2 whitespace-pre-wrap break-words">{step.content}</p>
          <p className="text-xs text-amber-700 mb-3">
            条件：{step.condition}
          </p>
          <BranchSummary label="是" tone="emerald" items={step.yesSubsteps} />
          <BranchSummary label="否" tone="red" items={step.noSubsteps} />
        </div>
      </div>
      {children}
    </div>
  );
}


function ActionStepEditor(props: {
  step: ActionStep;
  onChange: <K extends keyof ActionStep>(field: K, value: ActionStep[K]) => void;
  onChecklistAdd: () => void;
  onChecklistUpdate: (i: number, v: string) => void;
  onChecklistRemove: (i: number) => void;
  onImagesAdd: (srcs: string[]) => void;
  onImageRemove: (i: number) => void;
  onImageCaptionChange: (i: number, cap: string) => void;
  onDelete: () => void;
}): React.ReactElement {
  const {
    step,
    onChange,
    onChecklistAdd,
    onChecklistUpdate,
    onChecklistRemove,
    onImagesAdd,
    onImageRemove,
    onImageCaptionChange,
    onDelete,
  } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const images = step.images ?? [];
  const captions = step.imageCaptions ?? [];

  const readFilesAsDataUrls = (files: FileList | File[]): void => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    const limit = Math.max(0, 12 - images.length);
    if (limit === 0) {
      toast.warning('每个步骤最多保存 12 张图片');
      return;
    }
    const toRead = arr.slice(0, limit);
    Promise.all(
      toRead.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
    )
      .then((srcs) => onImagesAdd(srcs))
      .catch(() => toast.error('图片读取失败'));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLElement>): void => {
    const data = e.clipboardData;
    if (!data) return;
    const files: File[] = [];
    // 通路 1：DataTransferItemList（Chrome / Firefox 主要通路）
    if (data.items && data.items.length > 0) {
      for (let i = 0; i < data.items.length; i += 1) {
        const it = data.items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
    }
    // 通路 2：FileList 兜底（Safari / 某些 Windows 截图工具）
    if (files.length === 0 && data.files && data.files.length > 0) {
      for (let i = 0; i < data.files.length; i += 1) {
        const f = data.files[i];
        if (f && f.type.startsWith('image/')) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      readFilesAsDataUrls(files);
    }
  };

  const pasteFromClipboardApi = async (): Promise<void> => {
    // 允许用户不聚焦 Textarea 也能"一键粘贴剪贴板"
    try {
      const nav = navigator as Navigator & {
        clipboard?: { read?: () => Promise<ClipboardItems> };
      };
      if (!nav.clipboard?.read) {
        toast.info('当前浏览器不支持一键读取剪贴板，请聚焦到操作说明或图片区后按 Ctrl/⌘+V');
        return;
      }
      const items = await nav.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            files.push(new File([blob], `paste-${Date.now()}.${type.split('/')[1] || 'png'}`, { type }));
          }
        }
      }
      if (files.length === 0) {
        toast.warning('剪贴板里没有检测到图片');
        return;
      }
      readFilesAsDataUrls(files);
    } catch {
      toast.error('读取剪贴板失败，请授权网页读取剪贴板权限');
    }
  };

  return (
    <div className="space-y-4" onPaste={handlePaste}>
      <div>
        <FieldLabel>步骤标题</FieldLabel>
        <Input
          value={step.title}
          onChange={(e) => onChange('title', e.target.value)}
        />
      </div>
      <div>
        <FieldLabel>
          详细操作说明
          <span className="ml-1 text-slate-400 font-normal">（支持 Ctrl/⌘+V 粘贴图片、回车换行）</span>
        </FieldLabel>
        <Textarea
          value={step.content}
          rows={4}
          onChange={(e) => onChange('content', e.target.value)}
          onPaste={handlePaste}
          className="whitespace-pre-wrap"
        />
      </div>
      <SubstepsEditor
        substeps={step.substeps ?? []}
        onChange={(next) => onChange('substeps', next)}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>执行角色</FieldLabel>
          <Input
            value={step.role}
            onChange={(e) => onChange('role', e.target.value)}
          />
        </div>
        <div>
          <FieldLabel>预计耗时</FieldLabel>
          <Input
            value={step.time}
            onChange={(e) => onChange('time', e.target.value)}
          />
        </div>
      </div>
      <div>
        <FieldLabel>使用工具 / 系统（逗号分隔）</FieldLabel>
        <Input
          value={step.tools.join(', ')}
          onChange={(e) =>
            onChange(
              'tools',
              e.target.value
                .split(/[,，]/)
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
          placeholder="例如：WMS, PDA, 叉车"
        />
      </div>

      <div className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-3">
        <StringListEditor
          label="风险点"
          tone="danger"
          placeholder="填写一条风险点，如：数量差异导致后续账目不平"
          addLabel="添加风险点"
          items={step.risks ?? []}
          onChange={(next) => onChange('risks', next)}
        />
        <StringListEditor
          label="管控措施"
          tone="danger"
          placeholder="填写一条管控措施，如：系统自动比对 + 双人复核"
          addLabel="添加管控措施"
          items={step.controls ?? []}
          onChange={(next) => onChange('controls', next)}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <FieldLabel>
            示例图片
            <span className="ml-1 text-slate-400 font-normal">
              ({images.length}/12)
            </span>
          </FieldLabel>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) readFilesAsDataUrls(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={pasteFromClipboardApi}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              title="从系统剪贴板读取图片（需授权）"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              从剪贴板粘贴
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              上传图片
            </button>
          </div>
        </div>
        <div
          tabIndex={0}
          onPaste={handlePaste}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add('border-blue-400', 'bg-blue-50/40');
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50/40');
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50/40');
            if (e.dataTransfer.files.length > 0) {
              readFilesAsDataUrls(e.dataTransfer.files);
            }
          }}
          className="border-2 border-dashed border-slate-300 rounded-lg p-3 transition outline-none focus-visible:border-blue-400 focus-visible:bg-blue-50/30"
        >
          {images.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-4">
              <ImageIcon className="w-6 h-6 mx-auto mb-2 text-slate-300" />
              <p>拖拽 / 粘贴 / 点击上方按钮添加图片</p>
              <p className="mt-0.5">
                在<span className="text-slate-500">操作说明</span>或<span className="text-slate-500">本区域</span>内均支持 Ctrl/⌘+V
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {images.map((src, i) => (
                <div
                  key={i}
                  className="group relative rounded-md overflow-hidden border border-slate-200 bg-white flex flex-col"
                >
                  <div className="relative bg-slate-50 aspect-video">
                    <img
                      src={src}
                      alt={captions[i] || `示例 ${i + 1}`}
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => onImageRemove(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                      aria-label="移除图片"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white font-medium">
                      图 {i + 1}
                    </span>
                  </div>
                  <Input
                    value={captions[i] ?? ''}
                    onChange={(e) => onImageCaptionChange(i, e.target.value)}
                    placeholder={`点击输入图片说明（图 ${i + 1}）`}
                    className="h-8 text-xs border-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded-none bg-slate-50/50"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <FieldLabel>检查清单</FieldLabel>
        <div className="space-y-2">
          {step.checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox className="shrink-0" />
              <Input
                value={item}
                onChange={(e) => onChecklistUpdate(i, e.target.value)}
                className="flex-1 h-8 text-sm"
              />
              <button
                type="button"
                onClick={() => onChecklistRemove(i)}
                className="text-slate-400 hover:text-red-500"
                aria-label="移除"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={onChecklistAdd}
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 -ml-2 gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            添加检查项
          </Button>
        </div>
      </div>

      <div>
        <StringListEditor
          label="备注"
          tone="info"
          items={step.notes ?? []}
          onChange={(next) => onChange('notes', next)}
          placeholder="补充说明、上下游依赖、易踩坑点等（可多条）"
          addLabel="添加备注"
        />
      </div>

      <div className="pt-4 border-t border-slate-200">
        <Button
          variant="outline"
          onClick={onDelete}
          className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5"
        >
          <Trash2 className="w-4 h-4" />
          删除此步骤
        </Button>
      </div>
    </div>
  );
}

function DecisionStepEditor(props: {
  step: DecisionStep;
  onChange: <K extends keyof DecisionStep>(
    field: K,
    value: DecisionStep[K],
  ) => void;
  onDelete: () => void;
}): React.ReactElement {
  const { step, onChange, onDelete } = props;
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>节点标题</FieldLabel>
        <Input
          value={step.title}
          onChange={(e) => onChange('title', e.target.value)}
        />
      </div>
      <div>
        <FieldLabel>判断说明</FieldLabel>
        <Textarea
          value={step.content}
          rows={3}
          onChange={(e) => onChange('content', e.target.value)}
        />
      </div>
      <div>
        <FieldLabel>判断条件</FieldLabel>
        <Input
          value={step.condition}
          onChange={(e) => onChange('condition', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>执行角色</FieldLabel>
          <Input
            value={step.role}
            onChange={(e) => onChange('role', e.target.value)}
          />
        </div>
        <div>
          <FieldLabel>预计耗时</FieldLabel>
          <Input
            value={step.time}
            onChange={(e) => onChange('time', e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-emerald-100 text-emerald-700 text-xs font-semibold">
            是
          </span>
          <FieldLabel className="mb-0">「是」路径的操作步骤</FieldLabel>
        </div>
        <SubstepsEditor
          substeps={step.yesSubsteps ?? []}
          onChange={(next) => onChange('yesSubsteps', next)}
          hideLabel
          placeholder="+ 拆分「是」分支的操作步骤（例如 1. 系统自动过账 / 2. 通知下游 / 3. 归档）"
        />
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-red-100 text-red-700 text-xs font-semibold">
            否
          </span>
          <FieldLabel className="mb-0">「否」路径的操作步骤</FieldLabel>
        </div>
        <SubstepsEditor
          substeps={step.noSubsteps ?? []}
          onChange={(next) => onChange('noSubsteps', next)}
          hideLabel
          placeholder="+ 拆分「否」分支的操作步骤（例如 1. 挂起单据 / 2. 通知复核 / 3. 补录差异说明）"
        />
      </div>

      <div className="pt-4 border-t border-slate-200">
        <Button
          variant="outline"
          onClick={onDelete}
          className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5"
        >
          <Trash2 className="w-4 h-4" />
          删除此判断节点
        </Button>
      </div>
    </div>
  );
}
