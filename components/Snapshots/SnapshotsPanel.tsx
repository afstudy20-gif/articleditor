'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Ref, Snapshot } from '@/store/types';
import { listSnapshots, createSnapshot, deleteSnapshot } from '@/store/db';
import { docToText } from '@/lib/editor/doc-text';
import { diffWords } from '@/lib/ai/diff';

interface SnapshotsPanelProps {
  projectId: string;
  currentDoc: unknown;
  currentRefs: Ref[];
  currentAbstractText?: string;
  currentKeywords?: string[];
  currentWordCount: number;
  onRestore: (snap: Snapshot) => void;
  onClose: () => void;
  t: (k: string) => string;
}

function timeLabel(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function SnapshotsPanel({
  projectId,
  currentDoc,
  currentRefs,
  currentAbstractText,
  currentKeywords,
  currentWordCount,
  onRestore,
  onClose,
  t,
}: SnapshotsPanelProps): JSX.Element {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);

  const reload = async (): Promise<void> => {
    setSnaps(await listSnapshots(projectId));
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const onCreate = async (): Promise<void> => {
    setBusy(true);
    try {
      await createSnapshot(projectId, {
        label: t('snap_manual_label'),
        doc: currentDoc,
        refs: currentRefs,
        abstractText: currentAbstractText,
        keywords: currentKeywords,
        wordCount: currentWordCount,
        auto: false,
      });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string): Promise<void> => {
    await deleteSnapshot(id);
    if (compareId === id) setCompareId(null);
    await reload();
  };

  const compareSnap = useMemo(
    () => snaps.find((s) => s.id === compareId) ?? null,
    [snaps, compareId],
  );

  const diff = useMemo(() => {
    if (!compareSnap) return null;
    return diffWords(docToText(compareSnap.doc), docToText(currentDoc));
  }, [compareSnap, currentDoc]);

  return (
    <div className="card flex flex-col h-full bg-white">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-primary text-sm">🕓 {t('snap_title')}</h3>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
          ×
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border">
        <button
          onClick={onCreate}
          disabled={busy}
          className="btn-primary text-xs px-3 py-1.5 w-full disabled:opacity-50"
        >
          📸 {t('snap_create')}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {snaps.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted">{t('snap_empty')}</p>
        )}
        {snaps.map((s) => (
          <div key={s.id} className="px-3 py-2 border-b border-border text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-primary truncate">
                {s.auto ? '🤖 ' : ''}
                {s.label}
              </span>
              <span className="text-muted shrink-0">{typeof s.wordCount === 'number' ? `${s.wordCount}w` : ''}</span>
            </div>
            <div className="text-muted mt-0.5">{timeLabel(s.createdAt)}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={() => onRestore(s)}
                className="text-teal hover:underline"
              >
                ↩ {t('snap_restore')}
              </button>
              <button
                onClick={() => setCompareId((id) => (id === s.id ? null : s.id))}
                className={compareId === s.id ? 'text-primary font-semibold' : 'text-secondary hover:text-primary'}
              >
                ⇄ {t('snap_compare')}
              </button>
              <button onClick={() => onDelete(s.id)} className="text-red hover:underline ml-auto">
                {t('snap_delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {diff && (
        <div className="border-t border-border max-h-[40%] overflow-auto p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted font-semibold mb-1">
            {t('snap_diff_label')} ({t('snap_diff_vs_current')})
          </div>
          <div className="text-xs leading-relaxed whitespace-pre-wrap font-serif">
            {diff.map((seg, i) => {
              if (seg.type === 'add') {
                return (
                  <span key={i} className="bg-green-100 text-green-900 rounded px-0.5">
                    {seg.value}
                  </span>
                );
              }
              if (seg.type === 'remove') {
                return (
                  <span key={i} className="bg-red-100 text-red-900 line-through rounded px-0.5">
                    {seg.value}
                  </span>
                );
              }
              return <span key={i}>{seg.value}</span>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
