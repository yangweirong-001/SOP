import type { ReactElement } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FieldLabel } from './FieldLabel';

export function SubstepsEditor(props: {
  substeps: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hideLabel?: boolean;
}): ReactElement {
  const { substeps, onChange, placeholder, hideLabel } = props;
  const emptyText =
    placeholder ??
    '+ 拆分为多个编号子步骤（例如 1. 核对单据 / 2. 扫码上架 / 3. 录入系统）';
  const updateAt = (idx: number, val: string): void => {
    const next = [...substeps];
    next[idx] = val;
    onChange(next);
  };
  const removeAt = (idx: number): void => {
    onChange(substeps.filter((_, i) => i !== idx));
  };
  const add = (): void => {
    onChange([...substeps, '']);
  };
  const move = (idx: number, dir: -1 | 1): void => {
    const target = idx + dir;
    if (target < 0 || target >= substeps.length) return;
    const next = [...substeps];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  return (
    <div>
      {!hideLabel && (
        <div className="flex items-center justify-between mb-2">
          <FieldLabel>
            操作子步骤
            <span className="ml-1 text-slate-400 font-normal">
              （可拆分为 1/2/3… 编号步骤）
            </span>
          </FieldLabel>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={add}
            className="h-7 text-xs text-blue-600 hover:bg-blue-50"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            新增
          </Button>
        </div>
      )}
      {hideLabel && substeps.length > 0 && (
        <div className="flex justify-end mb-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={add}
            className="h-7 text-xs text-blue-600 hover:bg-blue-50"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            新增
          </Button>
        </div>
      )}
      {substeps.length === 0 ? (
        <button
          type="button"
          onClick={add}
          className="w-full text-xs text-slate-400 border border-dashed border-slate-300 rounded-md py-2.5 hover:border-blue-300 hover:text-blue-500 transition"
        >
          {emptyText}
        </button>
      ) : (
        <ol className="space-y-2">
          {substeps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 group">
              <span className="shrink-0 mt-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                {i + 1}
              </span>
              <Textarea
                value={s}
                placeholder={`第 ${i + 1} 步操作…（可按回车换行）`}
                onChange={(e) => updateAt(i, e.target.value)}
                className="flex-1 min-h-[36px] resize-y text-sm leading-relaxed whitespace-pre-wrap"
                rows={Math.max(1, (s.match(/\n/g)?.length ?? 0) + 1)}
              />
              <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition">
                <button
                  type="button"
                  title="上移"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-slate-400 hover:text-blue-600 disabled:opacity-30 text-[10px] leading-none"
                >
                  ▲
                </button>
                <button
                  type="button"
                  title="下移"
                  onClick={() => move(i, 1)}
                  disabled={i === substeps.length - 1}
                  className="text-slate-400 hover:text-blue-600 disabled:opacity-30 text-[10px] leading-none"
                >
                  ▼
                </button>
              </div>
              <button
                type="button"
                title="删除"
                onClick={() => removeAt(i)}
                className="shrink-0 mt-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
