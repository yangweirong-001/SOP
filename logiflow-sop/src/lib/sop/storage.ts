import type { SopDoc } from './types';

const SOPS_KEY = 'logiflow-sop:sops';
const ACTIVE_KEY = 'logiflow-sop:activeId';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** 从 localStorage 读取所有 SOP 文档 */
export function loadSops(): SopDoc[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(SOPS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as SopDoc[]) : [];
  } catch {
    return [];
  }
}

/**  保存所有 SOP 文档 */
export function saveSops(sops: SopDoc[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(SOPS_KEY, JSON.stringify(sops));
  } catch {}
}

/** 读取当前激活 SOP id */
export function loadActiveId(fallback: string): string {
  if (!isBrowser()) return fallback;
  try {
    const id = window.localStorage.getItem(ACTIVE_KEY);
    return id || fallback;
  } catch {
    return fallback;
  }
}

/**  记录当前激活 SOP id */
export function saveActiveId(id: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {}
}
