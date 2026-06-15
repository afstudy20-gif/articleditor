'use client';

import { useCallback, useEffect, useState } from 'react';
import { estimateStorageBytes, shrinkProject } from '@/store/db';

type Props = {
  projectId: string | null;
  onToast: (message: string) => void;
};

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StorageBar({ projectId, onToast }: Props) {
  const [usage, setUsage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setUsage(await estimateStorageBytes());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const shrink = useCallback(async () => {
    if (!projectId) return;
    const ok = window.confirm(
      'Bu projenin geri-alma anlık görüntüleri (snapshots) silinecek ve ' +
        'embedding önbelleği temizlenecek. Proje, kaynaklar ve notlar korunur. Devam edilsin mi?',
    );
    if (!ok) return;
    setBusy(true);
    try {
      const result = await shrinkProject(projectId);
      onToast(
        `Hafifletildi: ${result.snapshots} snapshot silindi, ` +
          `${result.embeddingsCleared} embedding temizlendi`,
      );
      await refresh();
    } catch {
      onToast('Hafifletilemedi');
    } finally {
      setBusy(false);
    }
  }, [projectId, onToast, refresh]);

  return (
    <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3 py-2 text-xs text-gray-500">
      <span title="Tarayıcının bu site için kullandığı yaklaşık depolama">
        Edge deposu: {usage != null ? formatMb(usage) : '—'}
      </span>
      <button
        type="button"
        onClick={shrink}
        disabled={!projectId || busy}
        title={
          projectId
            ? 'Snapshot’ları sil + embedding önbelleğini temizle (proje korunur)'
            : 'Önce bir proje seçin'
        }
        className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Hafifletiliyor…' : 'Edge’i hafiflet'}
      </button>
    </div>
  );
}
