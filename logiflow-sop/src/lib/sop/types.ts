export type ProcessType =
  | 'inbound'
  | 'outbound'
  | 'internal'
  | 'transport'
  | 'exception';

export interface ActionStep {
  id: number;
  type: 'action';
  title: string;
  content: string;
  role: string;
  time: string;
  tools: string[];
  /** @deprecated 已改为多风险点数组 `risks`，仅做旧数据兼容 */
  risk?: string;
  /** @deprecated 已改为多管控措施数组 `controls`，仅做旧数据兼容 */
  control?: string;
  /** 风险点列表（多条） */
  risks?: string[];
  /** 管控措施列表（多条） */
  controls?: string[];
  checklist: string[];
  images?: string[];
  /** 与 images 一一对应的图片说明（caption） */
  imageCaptions?: string[];
  /** 子步骤（编号 1/2/3...），用于拆解详细操作步骤 */
  substeps?: string[];
  /** 备注（可多条） */
  notes?: string[];
}

export interface DecisionStep {
  id: number;
  type: 'decision';
  title: string;
  content: string;
  condition: string;
  /** @deprecated 跳转目标已不在 UI 编辑，仅做兼容字段保留 */
  yesNext?: number;
  /** @deprecated 跳转目标已不在 UI 编辑，仅做兼容字段保留 */
  noNext?: number;
  /** "是"路径的操作子步骤（编号 1/2/3...） */
  yesSubsteps?: string[];
  /** "否"路径的操作子步骤（编号 1/2/3...） */
  noSubsteps?: string[];
  role: string;
  time: string;
  /** 挂载的父操作步骤 id；未设置视为悬空判断（兼容旧数据） */
  parentStepId?: number;
}

export type SopStep = ActionStep | DecisionStep;

export interface SopDoc {
  id: string;
  title: string;
  desc: string;
  type: ProcessType;
  owner: string;
  duration: string;
  scenario: string;
  version: string;
  status: '草稿' | '审核中' | '已发布' | '已启用' | '已归档' | '已停用' | string;
  updatedAt: string;
  steps: SopStep[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}
