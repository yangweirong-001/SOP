'use client';

import type { SopDoc, ActionStep, DecisionStep } from './types';
import { DEFAULT_SOPS } from './default-sops';

const STORAGE_KEY = 'logiflow_sops_v1';
const ACTIVE_KEY = 'logiflow_active_sop_v1';

/** 数据迁移：risks/controls 数组化 + DecisionStep 挂载到前一个 ActionStep */
function migrateSteps(sop: SopDoc): SopDoc {
  // 先收集本 SOP 里所有有效的 ActionStep id
  const actionIds = new Set(
    sop.steps.filter((s) => s.type === 'action').map((s) => s.id),
  );
  let lastActionId: number | undefined;
  const steps = sop.steps.map((s) => {
    if (s.type === 'action') {
      const step = s as ActionStep;
      lastActionId = step.id;
      let risks = step.risks;
      if (!risks || risks.length === 0) {
        risks = step.risk ? [step.risk] : [];
      }
      let controls = step.controls;
      if (!controls || controls.length === 0) {
        controls = step.control ? [step.control] : [];
      }
      return { ...step, risks, controls };
    }
    const dec = s as DecisionStep;
    // parentStepId 缺失，或指向不存在的 ActionStep → 自动挂到最近的 ActionStep
    if (dec.parentStepId == null || !actionIds.has(dec.parentStepId)) {
      return { ...dec, parentStepId: lastActionId };
    }
    return dec;
  });
  return { ...sop, steps };
}

export function loadSops(): SopDoc[] {
  if (typeof window === 'undefined') return DEFAULT_SOPS.map(migrateSteps);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SOPS.map(migrateSteps);
    const parsed = JSON.parse(raw) as SopDoc[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SOPS.map(migrateSteps);
    return parsed.map(migrateSteps);
  } catch {
    return DEFAULT_SOPS.map(migrateSteps);
  }
}

export function saveSops(sops: SopDoc[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sops));
  } catch {
    /* ignore */
  }
}

export function loadActiveId(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(ACTIVE_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function saveActiveId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}
