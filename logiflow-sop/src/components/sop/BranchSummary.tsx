"use client";

type Tone = "emerald" | "red" | "blue" | "slate";

interface BranchSummaryProps {
  label: string;
  tone?: Tone;
  items?: string[];
}

const toneStyles: Record<Tone, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  red: "border-red-200 bg-red-50 text-red-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  slate: "border-slate-200 bg-slate-50 text-slate-800",
};

export function BranchSummary({ label, tone = "slate", items }: BranchSummaryProps) {
  const list = Array.isArray(items) ? items.filter((s) => !!s && s.trim()) : [];
  return (
    <div className={`rounded-lg border p-3 ${toneStyles[tone]}`}>
      <div className="font-medium mb-2">分支：{label}</div>
      {list.length === 0 ? (
        <div className="text-sm opacity-60">（暂无子步骤）</div>
      ) : (
        <ul className="list-disc list-inside space-y-1 text-sm">
          {list.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
