import type { ReactElement } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { FieldLabel } from './FieldLabel';

export function StringListEditor(props: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  tone?: 'default' | 'danger' | 'success' | 'info';
  placeholder?: string;
  addLabel?: string;
}): ReactElement {
  const { label, items, onChange, tone = 'default', placeholder, addLabel } = props;
  const isDanger = tone === 'danger';
  const isInfo = tone === 'info';
  const bulletCls = isDanger
    ? 'bg-red-100 text-red-600'
    : tone === 'success'
      ? 'bg-emerald-100 text-emerald-600'
      : isInfo
        ? 'bg-sky-100 text-sky-600'
        : 'bg-slate-100 text-slate-600';
  const inputCls = isDanger
    ? 'bg-white border-red-200 focus-visible:ring-red-400 min-h-[36px] resize-y text-sm leading-relaxed whitespace-pre-wrap'
    : isInfo
      ? 'bg-white border-sky-200 focus-visible:ring-sky-400 min-h-[36px] resize-y text-sm leading-relaxed whitespace-pre-wrap'
      : 'bg-white min-h-[36px] resize-y text-sm leading-relaxed whitespace-pre-wrap';
  const btnCls = isDanger
    ? 'text-red-600 hover:text-red-700 hover:bg-red-100 -ml-2 gap-1'
    : isInfo
      ? 'text-sky-600 hover:text-sky-700 hover:bg-sky-50 -ml-2 gap-1'
      : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 -ml-2 gap-1';
  const update = (i: number, v: string): void => {
    const next = items.slice();
    next[i] = v;
    onChange(next);
  };
  const add = (): void => onChange([...items, '']);
  const remove = (i: number): void => {
    const next = items.slice();
    next.splice(i, 1);
    onChange(next);
  };
  return (
    <div>
      <FieldLabel tone={tone}>
        {label}
        <span className="ml-1 text-slate-400 font-normal">({items.length})</span>
      </FieldLabel>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span
              className={cn(
                'shrink-0 mt-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold',
                bulletCls,
              )}
            >
              {i + 1}
            </span>
            <Textarea
              value={item}
              onChange={(e) => update(i, e.target.value)}
              className={cn('flex-1', inputCls)}
              placeholder={placeholder}
              rows={Math.max(1, (item.match(/\n/g)?.length ?? 0) + 1)}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 mt-1.5 text-slate-400 hover:text-red-500"
              aria-label="移除"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={add} className={btnCls}>
          <Plus className="w-3.5 h-3.5" />
          {addLabel ?? `添加${label}`}
        </Button>
      </div>
    </div>
  );
}
