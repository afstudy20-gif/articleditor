'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { newId } from '@/lib/id';

interface TabSyncMessage {
  type: 'saved' | 'hello';
  tabId: string;
  ts: number;
}

/**
 * Detect concurrent edits to the same project across browser tabs. Each tab
 * broadcasts on a per-project BroadcastChannel after saving; if another tab
 * reports a newer save, `conflict` flips true so the UI can warn before this
 * tab's autosave overwrites the other's work.
 */
export function useTabSync(projectId: string): {
  conflict: boolean;
  dismiss: () => void;
  notifySaved: () => void;
} {
  const [conflict, setConflict] = useState(false);
  const tabId = useRef<string>('');
  const channel = useRef<BroadcastChannel | null>(null);
  const lastLocalSave = useRef<number>(0);

  if (!tabId.current) tabId.current = newId('tab');

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(`enr-proj-${projectId}`);
    channel.current = ch;
    const onMessage = (e: MessageEvent<TabSyncMessage>): void => {
      const msg = e.data;
      if (!msg || msg.tabId === tabId.current) return;
      if (msg.type === 'saved' && msg.ts > lastLocalSave.current) {
        setConflict(true);
      }
    };
    ch.addEventListener('message', onMessage);
    ch.postMessage({ type: 'hello', tabId: tabId.current, ts: Date.now() } satisfies TabSyncMessage);
    return () => {
      ch.removeEventListener('message', onMessage);
      ch.close();
      channel.current = null;
    };
  }, [projectId]);

  const notifySaved = useCallback(() => {
    const ts = Date.now();
    lastLocalSave.current = ts;
    channel.current?.postMessage({ type: 'saved', tabId: tabId.current, ts } satisfies TabSyncMessage);
  }, []);

  const dismiss = useCallback(() => setConflict(false), []);

  return { conflict, dismiss, notifySaved };
}
