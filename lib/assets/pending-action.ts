'use client';

export type ProjectAssetActionType = 'import-docx' | 'insert-figure' | 'import-table';

export type ProjectAssetAction = {
  projectId: string;
  assetId: string;
  type: ProjectAssetActionType;
  queuedAt: number;
};

const KEY = 'arted:pending-project-asset-action';

export function queueProjectAssetAction(action: Omit<ProjectAssetAction, 'queuedAt'>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify({ ...action, queuedAt: Date.now() }));
}

export function consumeProjectAssetAction(projectId: string): ProjectAssetAction | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const action = JSON.parse(raw) as ProjectAssetAction;
    if (!action || action.projectId !== projectId) return null;
    localStorage.removeItem(KEY);
    return action;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

