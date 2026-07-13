'use client';

import { useEffect, useRef, useState } from 'react';
import {
  listBriefcase,
  uploadToBriefcase,
  downloadFromBriefcase,
  removeFromBriefcase,
  type BriefcaseEntry,
} from '@/lib/sync/drive-briefcase';
import { downloadBlob } from '@/lib/download';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  onClose: () => void;
};

type Busy = { kind: 'upload'; name: string; part: number; totalParts: number }
  | { kind: 'download' | 'delete'; id: string };

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function DriveBriefcaseModal({ onClose }: Props) {
  const { t, lang } = useLang();
  const [entries, setEntries] = useState<BriefcaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listBriefcase());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    for (const file of Array.from(files)) {
      setBusy({ kind: 'upload', name: file.name, part: 1, totalParts: 1 });
      try {
        await uploadToBriefcase(file, (part, totalParts) => setBusy({ kind: 'upload', name: file.name, part, totalParts }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    setBusy(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    await refresh();
  };

  const download = async (entry: BriefcaseEntry) => {
    setError(null);
    setBusy({ kind: 'download', id: entry.id });
    try {
      const blob = await downloadFromBriefcase(entry);
      downloadBlob(blob, entry.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (entry: BriefcaseEntry) => {
    if (!confirm(t('briefcase_delete_confirm').replace('{name}', entry.name))) return;
    setError(null);
    setBusy({ kind: 'delete', id: entry.id });
    try {
      await removeFromBriefcase(entry);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <strong className="text-sm">💼 {t('briefcase_title')}</strong>
          <button type="button" className="ml-auto text-muted hover:text-primary" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          <p className="text-xs text-secondary">{t('briefcase_desc')}</p>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void uploadFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 border border-dashed border-border rounded-xl text-xs font-semibold text-sky-700 hover:bg-sky-50 transition disabled:opacity-50"
          >
            {busy?.kind === 'upload'
              ? `⏳ ${t('briefcase_uploading')} — ${busy.name}${busy.totalParts > 1 ? ` (${busy.part}/${busy.totalParts})` : ''}`
              : `⬆️ ${t('briefcase_upload')}`}
          </button>

          {error && <p className="text-[11px] text-red font-semibold">{error}</p>}

          {loading ? (
            <p className="text-[11px] text-muted text-center py-4">{t('briefcase_loading')}</p>
          ) : entries.length === 0 ? (
            <p className="text-[11px] text-muted text-center py-4">{t('briefcase_empty')}</p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-2 p-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-primary truncate">
                      {entry.name}
                      {entry.incomplete && (
                        <span className="ml-1 text-[9px] text-red font-bold">{t('briefcase_incomplete')}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted truncate">
                      {formatBytes(entry.size)} · {new Date(entry.modifiedTime).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={busy !== null || entry.incomplete}
                      onClick={() => void download(entry)}
                      className="text-[10px] font-semibold text-sky-700 border border-sky-200 bg-sky-50 hover:bg-sky-100 rounded px-2 py-1 disabled:opacity-40"
                    >
                      {busy?.kind === 'download' && busy.id === entry.id ? '⏳' : `⬇️ ${t('briefcase_download')}`}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void remove(entry)}
                      className="text-[10px] font-semibold text-red border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded px-2 py-1 disabled:opacity-40"
                    >
                      {busy?.kind === 'delete' && busy.id === entry.id ? '⏳' : `🗑️ ${t('briefcase_delete')}`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
