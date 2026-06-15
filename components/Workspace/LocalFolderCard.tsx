'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  clearWorkspaceRoot,
  getWorkspaceRoot,
  isFsAccessSupported,
  pickWorkspaceRoot,
} from '@/lib/fs/workspace';

/**
 * Dashboard card for choosing the local workspace folder. The root is global
 * (one folder for all projects); the PDF reader writes each saved PDF, its
 * annotations and project.json into `<root>/<project>/sources/`.
 */
export function LocalFolderCard() {
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = isFsAccessSupported();

  useEffect(() => {
    if (!supported) return;
    getWorkspaceRoot().then((root) => setName(root?.name ?? null));
  }, [supported]);

  const choose = useCallback(async () => {
    setError(null);
    try {
      const root = await pickWorkspaceRoot();
      if (root) setName(root.name);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('Klasör seçilemedi');
    }
  }, []);

  const clear = useCallback(async () => {
    await clearWorkspaceRoot();
    setName(null);
  }, []);

  return (
    <section className="card p-3 flex flex-col gap-2">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-primary flex items-center gap-1.5">
          📁 Yerel Klasör
          {name && <span className="text-emerald-500 text-xs">✓</span>}
        </h2>
        <p className="text-[11px] text-muted mt-0.5 truncate" title="<klasör>/<proje>/sources/">
          {error
            ? error
            : !supported
              ? 'Bu tarayıcı desteklemiyor (Chrome/Edge gerekir)'
              : name
                ? `Seçili: ${name}/`
                : 'PDF, not ve çizimleri diske yazar'}
        </p>
      </div>

      {supported && (
        <div className="mt-auto flex items-center gap-2 flex-wrap">
          <button onClick={choose} className="btn-primary text-xs px-3 py-1.5">
            {name ? 'Değiştir' : 'Klasör seç'}
          </button>
          {name && (
            <button onClick={clear} className="btn-secondary text-xs px-3 py-1.5">
              Kaldır
            </button>
          )}
        </div>
      )}
    </section>
  );
}
