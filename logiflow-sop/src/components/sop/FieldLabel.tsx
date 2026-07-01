import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FieldLabel(props: {
  children: ReactNode;
  tone?: 'default' | 'danger' | 'success' | 'info';
  className?: string;
}): ReactElement {
  const toneClass =
    props.tone === 'danger'
      ? 'text-red-600'
      : props.tone === 'success'
        ? 'text-emerald-600'
        : props.tone === 'info'
          ? 'text-sky-600'
          : 'text-slate-500';
  return (
    <label className={cn('block text-xs font-medium mb-1', toneClass, props.className)}>
      {props.children}
    </label>
  );
}
