'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { indexPdf } from '@/lib/rag/ingest';
import { hasWritePermission } from '@/lib/fs/workspace';
import { listProjectPdfs, kvGet, kvSet } from '@/store/db';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  projectId: string;
  projectTitle?: string;
  workspaceHandle: FileSystemDirectoryHandle | null;
};

const POLL_INTERVAL_MS = 30_000;
const KV_KEY = (projectId: string) => `watcher-${projectId}`;
const PDF_RE = /\.pdf$/i;

type Toast = { id: string; text: string; tone: 'info' | 'success' | 'error' };

/**
 * Background folder watcher for the active project. When on, the workspace's
 * `<root>/<project>/sources/` directory is polled every 30 s; any PDF the user
 * dropped there that isn't already indexed (by SHA-256) is run through
 * `indexPdf` so it becomes searchable in the RAG panel.
 *
 * The on/off state is persisted in the local kv store so a reload resumes the
 * watcher without a re-prompt. Toasts are rendered inline (no portal) and
 * self-dismiss after a few seconds.
 */
export function WatcherToggle({ projectId, projectTitle, workspaceHandle }: Props): JSX.Element | null {
  const { t } = useLang();
  const [on, setOn] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(false);

  const onRef = useRef(on);
  onRef.current = on;
  const handleRef = useRef(workspaceHandle);
  handleRef.current = workspaceHandle;
  const toastTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // Load persisted state once.
  useEffect(() => {
    let cancelled = false;
    kvGet<boolean>(KV_KEY(projectId))
      .then((v) => {
        if (!cancelled) setOn(Boolean(v));
      })
      .catch(() => {
        /* ignore — defaults to off */
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const pushToast = useCallback((text: string, tone: Toast['tone']) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, tone }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4000);
    toastTimers.current.push(timer);
  }, []);

  const toggle = useCallback(async () => {
    const next = !on;
    setOn(next);
    try {
      await kvSet(KV_KEY(projectId), next);
    } catch {
      /* persistence is best-effort */
    }
  }, [on, projectId]);

  // The actual polling loop. Re-armed whenever the toggle, handle, or project
  // changes so closing the panel/clearing the handle stops the work.
  useEffect(() => {
    if (!on || !workspaceHandle) return;

    let cancelled = false;

    const sourcesDir = async (): Promise<FileSystemDirectoryHandle | null> => {
      const handle = handleRef.current;
      if (!handle) return null;
      try {
        const projectDir = await handle.getDirectoryHandle(
          sanitize(projectTitle ?? projectId),
          { create: false },
        );
        return await projectDir.getDirectoryHandle('sources', { create: false });
      } catch {
        return null;
      }
    };

    const scan = async (): Promise<void> => {
      if (cancelled || !onRef.current) return;
      const dir = await sourcesDir();
      if (!dir) return;
      if (!(await hasWritePermission(handleRef.current as FileSystemDirectoryHandle))) return;

      setBusy(true);
      try {
        const existing = await listProjectPdfs(projectId);
        const existingNames = new Set(existing.map((p) => p.filename.toLowerCase()));

        // @ts-expect-error values() is part of the FS Access spec; lib.dom
        // typings in older TS don't include the async iterator on the dir handle.
        for await (const entry of dir.values()) {
          if (cancelled || !onRef.current) break;
          if (entry.kind !== 'file') continue;
          if (!PDF_RE.test(entry.name)) continue;
          if (existingNames.has(entry.name.toLowerCase())) continue;

          pushToast(t('rag_watcher_ingest').replace('{name}', entry.name), 'info');
          try {
            const file = await entry.getFile();
            await indexPdf({ file, projectId });
            pushToast(t('rag_watcher_done').replace('{name}', entry.name), 'success');
          } catch {
            pushToast(t('rag_watcher_failed').replace('{name}', entry.name), 'error');
          }
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    // Run once shortly after enabling, then on the interval.
    const warmup = setTimeout(() => {
      void scan();
    }, 1500);
    const interval = setInterval(() => {
      void scan();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(warmup);
      clearInterval(interval);
    };
  }, [on, workspaceHandle, projectId, projectTitle, pushToast, t]);

  // Clear any pending toast timers on unmount.
  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      for (const tm of timers) clearTimeout(tm);
      timers.length = 0;
    };
  }, []);

  if (!workspaceHandle) {
    // Render nothing visible when there is no workspace to watch; the host
    // panel usually explains how to pick a folder.
    return <></>;
  }

  const disabled = !hydrated;

  return (
    <>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={disabled}
        title={on ? t('rag_watcher_on') : t('rag_watcher_off')}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${
          on
            ? 'border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100'
            : 'border-border text-secondary hover:bg-slate-50'
        }`}
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            on ? (busy ? 'bg-amber-500 animate-pulse' : 'bg-teal-500') : 'bg-muted'
          }`}
        />
        {on ? t('rag_watcher_on') : t('rag_watcher_off')}
      </button>

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-1.5">
          {toasts.map((tt) => (
            <div
              key={tt.id}
              className={`max-w-xs rounded-md border px-3 py-1.5 text-xs shadow-md ${
                tt.tone === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : tt.tone === 'success'
                    ? 'border-teal-200 bg-teal-50 text-teal-700'
                    : 'border-border bg-white text-secondary'
              }`}
            >
              {tt.text}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function sanitize(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120) || 'project';
}
