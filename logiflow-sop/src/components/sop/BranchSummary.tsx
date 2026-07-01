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
    <div className={`rounded-md border px-3 py-2 text-sm ${toneStyles[tone]}`}>
      <div className="font-semibold mb-1">分支：{label}</div>
      {list.length === 0 ? (
        <div className="text-xs opacity-70">（暂无子步骤）</div>
      ) : (
        <ol className="list-decimal pl-5 space-y-0.5">
          {list.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
