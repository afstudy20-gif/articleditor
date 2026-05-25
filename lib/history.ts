// Session-scoped operation history with undo. Operations are pushed by
// EditorClient as user-actions occur. Each entry stores enough closure to
// reverse the change. History is NOT persisted to Dexie — cleared on reload.

export type HistoryOpType =
  | 'insert-citation'
  | 'delete-citation'
  | 'add-ref'
  | 'delete-ref'
  | 'bulk-delete-ref'
  | 'update-ref'
  | 'edit-ref';

export type HistoryEntry = {
  id: string;
  time: number;
  type: HistoryOpType;
  description: string;
  // Returns true if undo succeeded. Implementations should be idempotent
  // — calling undo on an already-undone op is a no-op.
  undo: () => boolean | void;
  undone?: boolean;
};

export function newHistoryId(): string {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export const HISTORY_LABELS: Record<HistoryOpType, string> = {
  'insert-citation': 'Atıf eklendi',
  'delete-citation': 'Atıf silindi',
  'add-ref': 'Referans eklendi',
  'delete-ref': 'Referans silindi',
  'bulk-delete-ref': 'Toplu silindi',
  'update-ref': 'Referans güncellendi',
  'edit-ref': 'Referans düzenlendi',
};

export function formatHistoryTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
