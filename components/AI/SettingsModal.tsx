'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadUserKeys, saveUserKeys, clearUserKeys, type UserKeys } from '@/lib/ai/user-keys';
import { PROVIDERS, getProviderMeta, type ProviderId } from '@/lib/ai/registry';

type Props = {
  onClose: () => void;
  onSaved?: () => void;
};

type FieldMap = {
  [P in ProviderId]: { keyField: keyof UserKeys; modelField: keyof UserKeys };
};

const FIELDS: FieldMap = {
  gemini: { keyField: 'geminiKey', modelField: 'geminiModel' },
  anthropic: { keyField: 'anthropicKey', modelField: 'anthropicModel' },
  openai: { keyField: 'openaiKey', modelField: 'openaiModel' },
  deepseek: { keyField: 'deepseekKey', modelField: 'deepseekModel' },
  nvidia: { keyField: 'nvidiaKey', modelField: 'nvidiaModel' },
};

export function SettingsModal({ onClose, onSaved }: Props): JSX.Element {
  const [keys, setKeys] = useState<UserKeys>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [serverStatus, setServerStatus] = useState<'unknown' | 'configured' | 'not-configured'>('unknown');
  // Per-provider test state.
  type TestState = { busy?: boolean; ok?: boolean; msg?: string; latencyMs?: number };
  const [tests, setTests] = useState<Record<ProviderId, TestState>>({} as Record<ProviderId, TestState>);

  async function testProvider(provider: ProviderId): Promise<void> {
    // Persist keys first so headers reflect the current input.
    saveUserKeys(keys);
    setTests((t) => ({ ...t, [provider]: { busy: true } }));
    try {
      const { aiHeaders } = await import('@/lib/ai/user-keys');
      const res = await fetch(`/api/ai/test?provider=${provider}`, {
        method: 'POST',
        headers: aiHeaders(),
      });
      const data = await res.json();
      if (data?.ok) {
        setTests((t) => ({
          ...t,
          [provider]: { ok: true, msg: `OK — yanıt: "${data.reply}"`, latencyMs: data.latencyMs },
        }));
      } else {
        setTests((t) => ({
          ...t,
          [provider]: { ok: false, msg: data?.error || `HTTP ${res.status}`, latencyMs: data?.latencyMs },
        }));
      }
    } catch (e) {
      setTests((t) => ({
        ...t,
        [provider]: { ok: false, msg: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  useEffect(() => {
    setKeys(loadUserKeys());
    fetch('/api/ai/status')
      .then((r) => r.json())
      .then((d) => setServerStatus(d?.configured ? 'configured' : 'not-configured'))
      .catch(() => setServerStatus('not-configured'));
  }, []);

  function patch(p: Partial<UserKeys>): void {
    setKeys((k) => ({ ...k, ...p }));
  }

  function save(): void {
    saveUserKeys(keys);
    onSaved?.();
    onClose();
  }

  function reset(): void {
    if (!confirm('Tüm AI anahtarları cihazından silinecek. Devam edilsin mi?')) return;
    clearUserKeys();
    setKeys({});
    onSaved?.();
  }

  const preferredOptions = useMemo(
    () =>
      PROVIDERS.filter((p) => {
        const f = FIELDS[p.id];
        return Boolean(keys[f.keyField]);
      }),
    [keys],
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[min(720px,95vw)] max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-primary">⚙️ AI Sağlayıcı Ayarları</h3>
            <p className="text-xs text-muted">
              Anahtarlar bu tarayıcıda localStorage&apos;da saklanır. Server&apos;a sadece istek başlığı olarak gönderilir, kalıcı kayıt yapılmaz.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
          {serverStatus === 'configured' && (
            <div className="bg-teal-bg border border-teal/30 rounded-lg p-2 text-xs text-secondary">
              ℹ️ Server&apos;da bir varsayılan anahtar tanımlı. Aşağıda boş bırakırsan server defaultu kullanılır.
            </div>
          )}

          {PROVIDERS.map((meta) => (
            <ProviderBlock
              key={meta.id}
              meta={meta}
              keyValue={(keys[FIELDS[meta.id].keyField] as string) ?? ''}
              modelValue={(keys[FIELDS[meta.id].modelField] as string) ?? ''}
              visible={Boolean(show[meta.id])}
              onToggleVisible={() => setShow((s) => ({ ...s, [meta.id]: !s[meta.id] }))}
              onKey={(v) => patch({ [FIELDS[meta.id].keyField]: v } as Partial<UserKeys>)}
              onModel={(v) => patch({ [FIELDS[meta.id].modelField]: v } as Partial<UserKeys>)}
              serverFallback={serverStatus === 'configured'}
              openaiBaseUrl={meta.id === 'openai' ? keys.openaiBaseUrl ?? '' : undefined}
              onOpenaiBaseUrl={meta.id === 'openai' ? (v) => patch({ openaiBaseUrl: v }) : undefined}
              test={tests[meta.id]}
              onTest={() => testProvider(meta.id)}
            />
          ))}

          <div>
            <label className="tool-label block mb-1">Tercih edilen sağlayıcı</label>
            <select
              value={keys.preferredProvider ?? ''}
              onChange={(e) =>
                patch({ preferredProvider: (e.target.value || undefined) as ProviderId | undefined })
              }
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal text-xs"
            >
              <option value="">Otomatik — anahtarı olan ilk sağlayıcı</option>
              {preferredOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {keys.preferredProvider && !preferredOptions.find((p) => p.id === keys.preferredProvider) && (
              <p className="text-xs text-amber-700 mt-1">
                Bu sağlayıcı için anahtar yok. Otomatik fallback devreye girer.
              </p>
            )}
          </div>

        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <button onClick={reset} className="text-xs text-red-600 hover:underline">
            Tüm anahtarları sil
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm text-muted hover:text-primary px-3 py-1.5">
              İptal
            </button>
            <button onClick={save} className="btn-primary text-sm px-4 py-1.5">
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ProviderBlock({
  meta,
  keyValue,
  modelValue,
  visible,
  onToggleVisible,
  onKey,
  onModel,
  serverFallback,
  openaiBaseUrl,
  onOpenaiBaseUrl,
  test,
  onTest,
}: {
  meta: ReturnType<typeof getProviderMeta>;
  keyValue: string;
  modelValue: string;
  visible: boolean;
  onToggleVisible: () => void;
  onKey: (v: string) => void;
  onModel: (v: string) => void;
  serverFallback: boolean;
  openaiBaseUrl?: string;
  onOpenaiBaseUrl?: (v: string) => void;
  test?: { busy?: boolean; ok?: boolean; msg?: string; latencyMs?: number };
  onTest?: () => void;
}): JSX.Element {
  const hasKey = keyValue.trim().length > 0;
  return (
    <div
      className={`border rounded-lg p-3 space-y-2 ${
        hasKey ? 'border-teal/40 bg-teal-bg/20' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-primary text-sm">{meta.name}</h4>
          {hasKey && <span className="text-[10px] text-teal">●  aktif</span>}
        </div>
        <div className="flex items-center gap-2">
          {serverFallback && (
            <span className="text-[10px] bg-slate-100 text-muted px-1.5 py-0.5 rounded">
              server fallback
            </span>
          )}
          {meta.helpUrl && (
            <a
              href={meta.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-teal hover:underline"
            >
              anahtar al ↗
            </a>
          )}
        </div>
      </div>
      <KeyRow
        label="API anahtarı"
        value={keyValue}
        placeholder={meta.keyPlaceholder ?? ''}
        visible={visible}
        onToggleVisible={onToggleVisible}
        onChange={onKey}
      />
      <div>
        <label className="tool-label block mb-0.5">Model</label>
        <select
          value={modelValue || meta.defaultModel}
          onChange={(e) => onModel(e.target.value)}
          className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal text-xs"
        >
          {meta.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} {m.id === meta.defaultModel ? '(varsayılan)' : ''}
            </option>
          ))}
        </select>
      </div>
      {onOpenaiBaseUrl && (
        <div>
          <label className="tool-label block mb-0.5">Base URL (opsiyonel)</label>
          <input
            value={openaiBaseUrl ?? ''}
            onChange={(e) => onOpenaiBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal text-xs font-mono"
            spellCheck={false}
          />
          <p className="text-[10px] text-muted mt-0.5">
            OpenAI-uyumlu özel endpoint kullanmıyorsan boş bırak.
          </p>
        </div>
      )}
      {onTest && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onTest}
            disabled={test?.busy || (!keyValue && !serverFallback)}
            className="text-xs border border-border rounded px-2.5 py-1 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title={!keyValue && !serverFallback ? 'Önce anahtar gir' : 'Bu sağlayıcıyı tek seferlik bir istekle test et'}
          >
            {test?.busy ? 'Test ediliyor…' : '🧪 Test et'}
          </button>
          {test?.msg && !test.busy && (
            <span
              className={`text-[11px] flex-1 truncate ${
                test.ok ? 'text-teal' : 'text-red-700'
              }`}
              title={test.msg}
            >
              {test.ok ? '✓' : '✗'} {test.msg}
              {test.latencyMs != null && (
                <span className="text-muted ml-1">({test.latencyMs}ms)</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function KeyRow({
  label,
  value,
  placeholder,
  visible,
  onToggleVisible,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  visible: boolean;
  onToggleVisible: () => void;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div>
      <label className="tool-label block mb-0.5">{label}</label>
      <div className="flex gap-2">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 border border-border rounded px-2 py-1.5 outline-none focus:border-teal text-xs font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="text-xs text-muted hover:text-primary px-2"
          title={visible ? 'Gizle' : 'Göster'}
        >
          {visible ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  );
}
