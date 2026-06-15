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
    <section className="card p-5 mb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            📁 Yerel Klasör
            {name && <span className="text-emerald-500 text-sm">✓</span>}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            PDF okuyucuda kaydettiğin PDF&apos;ler, notlar ve çizimler bu klasöre yazılır
            (her proje için ayrı alt klasör: <code>&lt;klasör&gt;/&lt;proje&gt;/sources/</code>).
          </p>
          {name && (
            <p className="text-xs text-secondary mt-1 font-semibold">Seçili klasör: {name}/</p>
          )}
          {!supported && (
            <p className="text-xs text-rose-500 mt-1">
              Bu tarayıcı yerel klasör seçimini desteklemiyor (Chrome/Edge gerekir).
            </p>
          )}
          {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
        </div>

        {supported && (
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={choose} className="btn-primary text-xs px-4 py-2">
              {name ? 'Klasörü değiştir' : 'Klasör seç'}
            </button>
            {name && (
              <button onClick={clear} className="btn-secondary text-xs px-4 py-2">
                Kaldır
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
