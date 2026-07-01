"use client";

import { useState } from "react";

type Tone = "danger" | "info" | "success" | "default";

export interface StringListEditorProps {
  label: string;
  tone?: Tone;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}

const toneStyles: Record<Tone, string> = {
  danger: "border-red-300 focus-within:border-red-500 bg-white",
  info: "border-blue-300 focus-within:border-blue-500 bg-white",
  success: "border-emerald-300 focus-within:border-emerald-500 bg-white",
  default: "border-slate-300 focus-within:border-slate-500 bg-white",
};

const btnTone: Record<Tone, string> = {
  danger: "bg-red-600 hover:bg-red-700",
  info: "bg-blue-600 hover:bg-blue-700",
  success: "bg-emerald-600 hover:bg-emerald-700",
  default: "bg-slate-700 hover:bg-slate-900",
};

export function StringListEditor({
  label,
  tone = "default",
  items,
  onChange,
  placeholder = "请输入内容",
  addLabel = "添加",
}: StringListEditorProps) {
  const [draft, setDraft] = useState("");
  const list = Array.isArray(items) ? items : [];

  const handleAdd = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...list, v]);
    setDraft("");
  };

  const handleUpdate = (idx: number, v: string) => {
    const next = list.slice();
    next[idx] = v;
    onChange(next);
  };

  const handleRemove = (idx: number) => {
    const next = list.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="font-medium text-sm">{label}</div>
      <div className="space-y-2">
        {list.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <textarea
              value={item}
              onChange={(e) => handleUpdate(idx, e.target.value)}
              rows={1}
              className={`flex-1 rounded-md border px-2 py-1 text-sm ${toneStyles[tone]}`}
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="text-xs text-slate-500 hover:text-red-600 px-2 py-1"
            >
              删除
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={1}
          className={`flex-1 rounded-md border px-2 py-1 text-sm ${toneStyles[tone]}`}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button
          type="button"
          onClick={handleAdd}
          className={`text-xs text-white rounded px-3 py-1 ${btnTone[tone]}`}
        >
          {addLabel}
        </button>
      </div>
    </div>
  );
}
