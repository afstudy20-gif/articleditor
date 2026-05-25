'use client';

import { useState } from 'react';
import type { Ref } from '@/store/types';
import { aiHeaders } from '@/lib/ai/user-keys';

type Cluster = {
  theme: string;
  summary: string;
  takeaway: string;
  refs: Ref[];
};

type Props = {
  initialAbstract: string;
  onClose: () => void;
  onAddRef: (ref: Ref) => void;
};

export function DeepResearchPanel({ initialAbstract, onClose, onAddRef }: Props): JSX.Element {
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState(initialAbstract);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [positioning, setPositioning] = useState<string | null>(null);

  async function run(): Promise<void> {
    if (abstract.trim().length < 50) {
      setError('Özet en az 50 karakter olmalı.');
      return;
    }
    setLoading(true);
    setError(null);
    setClusters([]);
    setPositioning(null);
    try {
      const res = await fetch('/api/ai/deep-research', {
        method: 'POST',
        headers: aiHeaders(),
        body: JSON.stringify({ title, abstract, lang: 'tr' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { clusters: Cluster[]; positioning?: string };
      setClusters(data.clusters);
      setPositioning(data.positioning ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h3 className="font-semibold text-primary text-sm">🗺️ Related work haritası</h3>
          <p className="text-xs text-muted">CrossRef + OpenAlex + PubMed → tematik kümeler</p>
        </div>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
          ×
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3 text-sm">
        <div>
          <label className="tool-label block mb-1">Başlık (opsiyonel)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-border rounded px-2 py-1 outline-none focus:border-teal text-xs"
          />
        </div>
        <div>
          <label className="tool-label block mb-1">Özet</label>
          <textarea
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            rows={5}
            className="w-full border border-border rounded px-2 py-1 outline-none focus:border-teal text-xs"
          />
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50 w-full"
        >
          {loading ? 'Harita oluşturuluyor (30-60s)…' : '🗺️ Haritayı oluştur'}
        </button>
        {error && <p className="text-red text-xs">{error}</p>}

        {positioning && (
          <div className="bg-teal-bg border border-teal/30 rounded-lg p-2 text-xs text-secondary">
            <span className="tool-label">Konumlandırma</span>
            <p className="mt-1 leading-relaxed">{positioning}</p>
          </div>
        )}

        {clusters.map((c, i) => (
          <div key={i} className="border border-border rounded-lg p-2 text-xs">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-semibold text-primary">{c.theme}</h4>
              <span className="text-muted">{c.refs.length} ref</span>
            </div>
            <p className="text-secondary leading-snug mb-1">{c.summary}</p>
            {c.takeaway && (
              <p className="text-teal italic leading-snug mb-2">
                💡 {c.takeaway}
              </p>
            )}
            <div className="space-y-1">
              {c.refs.map((r) => (
                <div key={r.id} className="flex items-start gap-2 border-t border-border pt-1">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-primary truncate">{r.title ?? '(Başlıksız)'}</div>
                    <div className="text-muted truncate">
                      {r.authors[0]?.family || '—'}
                      {r.authors.length > 1 ? ' et al.' : ''} · {r.year ?? '?'} ·{' '}
                      {r.containerTitle ?? '—'}
                    </div>
                    {r.doi && <div className="text-teal text-[10px]">{r.doi}</div>}
                  </div>
                  <button
                    onClick={() => onAddRef(r)}
                    className="text-[11px] text-teal hover:underline shrink-0"
                  >
                    + Kütüphaneye
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
