'use client';

import { useEffect, useState } from 'react';
import type {
  AiDetectionResult,
  PlagiarismResult,
} from '@/lib/integrity/copyleaks';
import { useLang } from '@/lib/i18n/hooks';

interface Props {
  text: string;
  title: string;
  onClose: () => void;
}

interface IntegrityStatus {
  provider: string;
  aiDetection: boolean;
  plagiarism: boolean;
  sandbox: boolean;
}

type RequestState<T> = {
  loading: boolean;
  error: string | null;
  result: T | null;
};

const EMPTY_STATE = { loading: false, error: null, result: null };

export function IntegrityModal({ text, title, onClose }: Props): JSX.Element {
  const { lang } = useLang();
  const tr = lang === 'tr';
  const [status, setStatus] = useState<IntegrityStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [ai, setAi] = useState<RequestState<AiDetectionResult>>(EMPTY_STATE);
  const [plagiarism, setPlagiarism] =
    useState<RequestState<PlagiarismResult>>(EMPTY_STATE);

  useEffect(() => {
    fetch('/api/integrity/status')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        setStatus(data as IntegrityStatus);
      })
      .catch((error) => setStatusError(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    const result = plagiarism.result;
    if (!result || result.status !== 'pending') return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/integrity/plagiarism/${result.scanId}`, {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        const next = data as PlagiarismResult;
        setPlagiarism({ loading: next.status === 'pending', error: null, result: next });
      } catch (error) {
        setPlagiarism((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [plagiarism.result]);

  async function runAiDetection(): Promise<void> {
    setAi({ loading: true, error: null, result: null });
    try {
      const response = await fetch('/api/integrity/ai-detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setAi({ loading: false, error: null, result: data as AiDetectionResult });
    } catch (error) {
      setAi({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        result: null,
      });
    }
  }

  async function runPlagiarism(): Promise<void> {
    setPlagiarism({ loading: true, error: null, result: null });
    try {
      const response = await fetch('/api/integrity/plagiarism', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, title }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setPlagiarism({
        loading: true,
        error: null,
        result: data as PlagiarismResult,
      });
    } catch (error) {
      setPlagiarism({
        loading: false,
        error: error instanceof Error ? error.message : String(error),
        result: null,
      });
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[min(900px,95vw)] max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-primary">
              {tr ? 'Özgünlük ve AI Denetimi' : 'Integrity and AI Check'}
            </h3>
            <p className="text-xs text-muted">
              {tr ? 'Copyleaks sunucu entegrasyonu' : 'Copyleaks server integration'}
              {status?.sandbox ? ` · ${tr ? 'test modu' : 'sandbox mode'}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg">×</button>
        </div>

        <div className="flex-1 overflow-auto p-4 grid gap-4 md:grid-cols-2 text-sm">
          <section className="border border-border rounded-xl p-4 space-y-3">
            <div>
              <h4 className="font-semibold text-primary">
                {tr ? 'AI-yazım olasılığı' : 'AI-writing likelihood'}
              </h4>
              <p className="text-xs text-secondary mt-1">
                {tr
                  ? 'Metni bölüm bölüm tarar; sonuç yazarlık kanıtı değildir.'
                  : 'Scans the text in chunks; the result is not proof of authorship.'}
              </p>
            </div>
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              {tr
                ? 'Uyarı: AI dedektörleri, özellikle ana dili İngilizce olmayan araştırmacılarda yanlış pozitif üretebilir. Sonucu yalnızca risk göstergesi olarak kullanın.'
                : 'Caution: AI detectors can produce false positives, especially for non-native English writers. Use this only as a risk indicator.'}
            </div>
            {ai.result && (
              <div className="rounded-lg bg-slate-50 border border-border p-3">
                <div className="flex items-end justify-between">
                  <span className="text-xs text-secondary">
                    {tr ? 'AI olasılığı' : 'AI likelihood'}
                  </span>
                  <strong className="text-2xl text-primary">
                    {formatPercent(ai.result.aiProbability)}
                  </strong>
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden mt-2">
                  <div
                    className="h-full bg-violet-500"
                    style={{ width: formatPercent(ai.result.aiProbability) }}
                  />
                </div>
                <p className="text-[11px] text-muted mt-2">
                  {ai.result.chunks} {tr ? 'metin parçası incelendi' : 'text chunk(s) checked'}
                </p>
              </div>
            )}
            {ai.error && <p className="text-xs text-red">{ai.error}</p>}
            {!status?.aiDetection && status && (
              <ConfigMessage tr={tr} feature="ai" />
            )}
            <button
              onClick={() => void runAiDetection()}
              disabled={!status?.aiDetection || ai.loading || text.trim().length < 255}
              className="btn-primary w-full py-2 disabled:opacity-50"
            >
              {ai.loading
                ? tr ? 'Taranıyor…' : 'Scanning…'
                : tr ? 'AI denetimini başlat' : 'Run AI check'}
            </button>
          </section>

          <section className="border border-border rounded-xl p-4 space-y-3">
            <div>
              <h4 className="font-semibold text-primary">
                {tr ? 'Benzerlik / intihal taraması' : 'Similarity / plagiarism scan'}
              </h4>
              <p className="text-xs text-secondary mt-1">
                {tr
                  ? 'İnternet ve erişilebilir veri tabanlarında benzer metinleri arar.'
                  : 'Searches for matching text across the internet and available databases.'}
              </p>
            </div>
            {plagiarism.result?.status === 'pending' && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                {tr
                  ? 'Tarama sunucuda sürüyor. Sonuç otomatik olarak yenilenecek.'
                  : 'The server scan is in progress. Results will refresh automatically.'}
              </div>
            )}
            {plagiarism.result?.status === 'completed' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-50 border border-border p-3 flex items-end justify-between">
                  <span className="text-xs text-secondary">
                    {tr ? 'Toplam benzerlik' : 'Overall similarity'}
                  </span>
                  <strong className="text-2xl text-primary">
                    {formatScore(plagiarism.result.score?.aggregated)}
                  </strong>
                </div>
                {plagiarism.result.sources.length > 0 && (
                  <div className="space-y-1.5">
                    <h5 className="text-xs font-semibold text-primary">
                      {tr ? 'Eşleşen kaynaklar' : 'Matching sources'}
                    </h5>
                    {plagiarism.result.sources.slice(0, 10).map((source) => (
                      <div key={source.id} className="rounded-md border border-border p-2 text-xs">
                        {source.url ? (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-teal hover:underline"
                          >
                            {source.title}
                          </a>
                        ) : (
                          <span className="text-primary">{source.title}</span>
                        )}
                        {source.matchedWords != null && (
                          <span className="block text-muted mt-0.5">
                            {source.matchedWords} {tr ? 'eşleşen kelime' : 'matched words'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {plagiarism.result?.status === 'error' && (
              <p className="text-xs text-red">{plagiarism.result.error}</p>
            )}
            {plagiarism.error && <p className="text-xs text-red">{plagiarism.error}</p>}
            {!status?.plagiarism && status && (
              <ConfigMessage tr={tr} feature="plagiarism" />
            )}
            <button
              onClick={() => void runPlagiarism()}
              disabled={!status?.plagiarism || plagiarism.loading || text.trim().length < 50}
              className="btn-primary w-full py-2 disabled:opacity-50"
            >
              {plagiarism.loading
                ? tr ? 'Tarama sürüyor…' : 'Scan in progress…'
                : tr ? 'Benzerlik taramasını başlat' : 'Run similarity scan'}
            </button>
          </section>
        </div>

        {(statusError || !status) && (
          <div className="px-4 pb-4 text-xs text-red">
            {statusError ?? (tr ? 'Entegrasyon durumu kontrol ediliyor…' : 'Checking integration status…')}
          </div>
        )}
      </div>
    </>
  );
}

function ConfigMessage({ tr, feature }: { tr: boolean; feature: string }): JSX.Element {
  const text = feature === 'plagiarism'
    ? tr
      ? 'Benzerlik taraması için Copyleaks anahtarlarına ek olarak COPYLEAKS_WEBHOOK_SECRET ve herkese açık HTTPS COPYLEAKS_WEBHOOK_BASE_URL gereklidir.'
      : 'Similarity scanning also requires COPYLEAKS_WEBHOOK_SECRET and a public HTTPS COPYLEAKS_WEBHOOK_BASE_URL.'
    : tr
      ? 'AI denetimi sunucuda yapılandırılmamış. COPYLEAKS_EMAIL ve COPYLEAKS_API_KEY ortam değişkenlerini ekleyin.'
      : 'AI detection is not configured on the server. Add COPYLEAKS_EMAIL and COPYLEAKS_API_KEY environment variables.';
  return (
    <p className="rounded-lg bg-slate-50 border border-border p-3 text-xs text-secondary">
      {text}
    </p>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatScore(value: number | undefined): string {
  return value == null ? '—' : `${Math.round(value * 10) / 10}%`;
}
