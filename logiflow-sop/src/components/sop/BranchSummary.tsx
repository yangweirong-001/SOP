import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

export function BranchSummary(props: {
  label: string;
  tone: 'emerald' | 'red';
  items?: string[];
}): ReactElement | null {
  const { label, tone, items } = props;
  const list = items ?? [];
  const toneCls =
    tone === 'emerald'
      ? {
          chip: 'bg-emerald-100 text-emerald-700',
          border: 'border-emerald-200',
          bg: 'bg-emerald-50/40',
          numBg: 'bg-emerald-100 text-emerald-700',
          text: 'text-emerald-900',
        }
      : {
          chip: 'bg-red-100 text-red-700',
          border: 'border-red-200',
          bg: 'bg-red-50/40',
          numBg: 'bg-red-100 text-red-700',
          text: 'text-red-900',
        };
  if (list.length === 0) {
    return (
      <div
        className={cn(
          'text-xs italic mb-2 px-2.5 py-1.5 rounded border',
          toneCls.border,
          toneCls.bg,
          'text-slate-400',
        )}
      >
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-[24px] h-5 px-1 mr-1.5 rounded font-medium not-italic',
            toneCls.chip,
          )}
        >
          {label}
        </span>
        暂无「{label}」分支的操作步骤（可在右侧属性面板添加）
      </div>
    );
  }
  const preview = list.slice(0, 3);
  const rest = list.length - preview.length;
  return (
    <div className={cn('mb-2 px-2.5 py-1.5 rounded border', toneCls.border, toneCls.bg)}>
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-[24px] h-5 px-1 rounded font-medium text-xs',
            toneCls.chip,
          )}
        >
          {label}
        </span>
        <span className="text-[11px] text-slate-500">共 {list.length} 步</span>
      </div>
      <ol className="space-y-0.5">
        {preview.map((s, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs">
            <span
              className={cn(
                'shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold mt-0.5',
                toneCls.numBg,
              )}
            >
              {i + 1}
            </span>
            <span className={cn('flex-1 min-w-0 truncate', toneCls.text)}>
              {s || `第 ${i + 1} 步操作`}
            </span>
          </li>
        ))}
      </ol>
      {rest > 0 && (
        <div className="mt-1 text-[11px] text-slate-500 pl-5">…还有 {rest} 步操作</div>
      )}
    </div>
  );
}
