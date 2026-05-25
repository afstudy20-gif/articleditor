'use client';

import { useEffect, useState } from 'react';
import { loadUserKeys, saveUserKeys, clearUserKeys, type UserKeys } from '@/lib/ai/user-keys';

type Props = {
  onClose: () => void;
  onSaved?: () => void;
};

export function SettingsModal({ onClose, onSaved }: Props): JSX.Element {
  const [keys, setKeys] = useState<UserKeys>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [serverStatus, setServerStatus] = useState<'unknown' | 'configured' | 'not-configured'>('unknown');
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

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

  async function test(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so test uses fresh headers
      saveUserKeys(keys);
      const { aiHeaders } = await import('@/lib/ai/user-keys');
      const res = await fetch('/api/ai/status', { headers: aiHeaders() });
      const data = await res.json();
      if (data?.configured) {
        setTestResult({ ok: true, msg: `OK — aktif sağlayıcı: ${data.provider}` });
      } else {
        setTestResult({ ok: false, msg: 'Hiç anahtar tanınmadı. Boş alanları doldur.' });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[min(640px,95vw)] max-h-[90vh] flex flex-col">
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

        <div className="flex-1 overflow-auto p-4 space-y-4 text-sm">
          {serverStatus === 'configured' && (
            <div className="bg-teal-bg border border-teal/30 rounded-lg p-2 text-xs text-secondary">
              ℹ️ Server&apos;da bir varsayılan anahtar tanımlı. Aşağıda boş bırakırsan server defaultu kullanılır.
            </div>
          )}

          <ProviderBlock
            title="Google Gemini"
            badge={serverStatus === 'configured' ? 'server fallback var' : null}
            keyValue={keys.geminiKey ?? ''}
            keyPlaceholder="AIzaSy..."
            modelValue={keys.geminiModel ?? ''}
            modelPlaceholder="gemini-2.5-flash"
            visible={show.gemini}
            onToggleVisible={() => setShow((s) => ({ ...s, gemini: !s.gemini }))}
            onKey={(v) => patch({ geminiKey: v })}
            onModel={(v) => patch({ geminiModel: v })}
          />

          <ProviderBlock
            title="Anthropic Claude"
            badge={serverStatus === 'configured' ? 'server fallback var' : null}
            keyValue={keys.anthropicKey ?? ''}
            keyPlaceholder="sk-ant-..."
            modelValue={keys.anthropicModel ?? ''}
            modelPlaceholder="claude-sonnet-4-5-20250929"
            visible={show.anthropic}
            onToggleVisible={() => setShow((s) => ({ ...s, anthropic: !s.anthropic }))}
            onKey={(v) => patch({ anthropicKey: v })}
            onModel={(v) => patch({ anthropicModel: v })}
          />

          <div className="border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-primary text-sm">OpenAI uyumlu</h4>
              {serverStatus === 'configured' && (
                <span className="text-[10px] bg-slate-100 text-muted px-1.5 py-0.5 rounded">
                  server fallback var
                </span>
              )}
            </div>
            <KeyRow
              label="API anahtarı"
              value={keys.openaiKey ?? ''}
              placeholder="sk-..."
              visible={show.openai}
              onToggleVisible={() => setShow((s) => ({ ...s, openai: !s.openai }))}
              onChange={(v) => patch({ openaiKey: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <TextRow
                label="Model"
                value={keys.openaiModel ?? ''}
                placeholder="gpt-4o-mini"
                onChange={(v) => patch({ openaiModel: v })}
              />
              <TextRow
                label="Base URL (opsiyonel)"
                value={keys.openaiBaseUrl ?? ''}
                placeholder="https://api.openai.com/v1"
                onChange={(v) => patch({ openaiBaseUrl: v })}
              />
            </div>
          </div>

          <div>
            <label className="tool-label block mb-1">Tercih edilen sağlayıcı</label>
            <select
              value={keys.preferredProvider ?? ''}
              onChange={(e) =>
                patch({ preferredProvider: (e.target.value || undefined) as UserKeys['preferredProvider'] })
              }
              className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal text-xs"
            >
              <option value="">Otomatik (önce Gemini, sonra Anthropic, sonra OpenAI)</option>
              <option value="gemini">Gemini</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          {testResult && (
            <div
              className={`rounded-lg p-2 text-xs ${testResult.ok ? 'bg-teal-bg border border-teal/30 text-teal' : 'bg-red-50 border border-red-300 text-red-700'}`}
            >
              {testResult.msg}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <button onClick={reset} className="text-xs text-red-600 hover:underline">
            Tüm anahtarları sil
          </button>
          <div className="flex gap-2">
            <button
              onClick={test}
              disabled={testing}
              className="text-sm border border-border rounded px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              {testing ? 'Test ediliyor…' : 'Test et'}
            </button>
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
  title,
  badge,
  keyValue,
  keyPlaceholder,
  modelValue,
  modelPlaceholder,
  visible,
  onToggleVisible,
  onKey,
  onModel,
}: {
  title: string;
  badge: string | null;
  keyValue: string;
  keyPlaceholder: string;
  modelValue: string;
  modelPlaceholder: string;
  visible: boolean;
  onToggleVisible: () => void;
  onKey: (v: string) => void;
  onModel: (v: string) => void;
}): JSX.Element {
  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-primary text-sm">{title}</h4>
        {badge && (
          <span className="text-[10px] bg-slate-100 text-muted px-1.5 py-0.5 rounded">{badge}</span>
        )}
      </div>
      <KeyRow
        label="API anahtarı"
        value={keyValue}
        placeholder={keyPlaceholder}
        visible={visible}
        onToggleVisible={onToggleVisible}
        onChange={onKey}
      />
      <TextRow label="Model" value={modelValue} placeholder={modelPlaceholder} onChange={onModel} />
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

function TextRow({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div>
      <label className="tool-label block mb-0.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-border rounded px-2 py-1.5 outline-none focus:border-teal text-xs"
      />
    </div>
  );
}
