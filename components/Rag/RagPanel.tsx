'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from '@/store/types';
import { useLang } from '@/lib/i18n/hooks';
import { searchProjectChunks } from '@/lib/rag/search';
import { ragChat, type RagChatMessage } from '@/lib/rag/chat-client';
import { RagChatError } from '@/lib/rag/errors';
import { listProjectPdfs } from '@/store/db';
import { ChatBubble, type ChatCitation } from './ChatBubble';

type RagMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  error?: boolean;
};

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  refs: Ref[];
  onCiteClick?: (refId: string, pageNo?: number) => void;
};

const TOP_K = 8;
const MMR_LAMBDA = 0.5;
const MAX_HISTORY = 20;
const STORAGE_PREFIX = 'rag-chat-';

/**
 * Right-side RAG chat panel. Runs the retrieve → read pipeline locally:
 * `searchProjectChunks` for the top-k passages, then `ragChat` to synthesize a
 * cited answer. Citations emitted as `[chunk_id]` markers in the answer are
 * bound back to refs/pages here so the chips can jump the user to the source.
 *
 * The last 20 messages are persisted to localStorage keyed by project, so a
 * reload continues the conversation without a server round-trip.
 */
export function RagPanel({ projectId, open, onClose, refs, onCiteClick }: Props): JSX.Element | null {
  const { t } = useLang();
  const [messages, setMessages] = useState<RagMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [indexedCount, setIndexedCount] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refsById = useMemo(() => {
    const m = new Map<string, Ref>();
    for (const r of refs) m.set(r.id, r);
    return m;
  }, [refs]);

  // Load persisted history once per project.
  useEffect(() => {
    setHydrated(false);
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as RagMessage[];
        if (Array.isArray(parsed)) {
          setMessages(parsed.filter((m) => m && typeof m.content === 'string').slice(0, MAX_HISTORY));
        }
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
    setHydrated(true);
  }, [projectId]);

  // Count of indexed PDFs for this project. Fetched once per project on mount
  // (no polling) — the panel re-fetches the next time it is reopened. The
  // empty-state banner uses this to disable the input until the user has
  // indexed at least one PDF via the library tab.
  useEffect(() => {
    let cancelled = false;
    listProjectPdfs(projectId)
      .then((pdfs) => {
        if (!cancelled) setIndexedCount(pdfs.length);
      })
      .catch(() => {
        /* IndexedDB read failed — keep the count at 0, input stays disabled. */
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Persist on every change (after initial hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const trimmed = messages.slice(-MAX_HISTORY);
      window.localStorage.setItem(`${STORAGE_PREFIX}${projectId}`, JSON.stringify(trimmed));
    } catch {
      /* localStorage may be full or disabled — chat still works in-memory. */
    }
  }, [messages, projectId, hydrated]);

  // Autoscroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // Abort any in-flight request when the panel closes.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [open]);

  const sourceTitleFor = useCallback(
    (refId: string | undefined, fallback: string): string => {
      if (!refId) return fallback;
      const ref = refsById.get(refId);
      return ref?.title || ref?.containerTitle || fallback;
    },
    [refsById],
  );

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || busy || indexedCount === 0) return;

    setError(null);
    setInput('');

    const userMsg: RagMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);

    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const hits = await searchProjectChunks({
        projectId,
        query: question,
        k: TOP_K,
        mmrLambda: MMR_LAMBDA,
      });

      if (hits.length === 0) {
        const empty: RagMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: t('rag_no_library'),
        };
        setMessages((prev) => [...prev, empty]);
        return;
      }

      const citations: ChatCitation[] = hits.map((h) => {
        const ref = h.refId ? refsById.get(h.refId) : undefined;
        return {
          chunkId: h.id,
          refId: h.refId,
          pageNo: h.pageNo,
          refNumber: ref ? refOrderNumber(ref) : undefined,
          sourceTitle: sourceTitleFor(h.refId, h.text.slice(0, 60)),
        };
      });

      const history: RagChatMessage[] = messages
        .slice(-6)
        .filter((m) => !m.error)
        .map((m) => ({
          role: m.role,
          content: m.content,
          // Backend expects numeric citation slots; we have chunk ids. We omit
          // them on the wire and let the model re-cite from context.
        }));

      const { answer, citedChunkIds } = await ragChat(
        {
          question,
          contextChunks: hits.map((h) => ({
            id: h.id,
            text: h.text,
            refId: h.refId ?? '',
            pageNo: h.pageNo,
          })),
          history,
        },
        { signal: controller.signal },
      );

      // Only surface cited chunks under the answer text, but keep all retrieved
      // citations available for resolution if the model omitted a marker.
      const citedSet = new Set(citedChunkIds);
      const shownCitations = citations.filter(
        (c) => citedSet.size === 0 || citedSet.has(c.chunkId),
      );

      const assistantMsg: RagMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: answer,
        citations: shownCitations,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User-initiated cancel (e.g. panel closed) — no error toast.
        return;
      }
      const message =
        err instanceof RagChatError
          ? err.message
          : /search/i.test(question)
            ? t('rag_error_search')
            : t('rag_error_chat');
      setError(message);
      const failMsg: RagMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: message,
        error: true,
      };
      setMessages((prev) => [...prev, failMsg]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, input, messages, projectId, refsById, sourceTitleFor, t, indexedCount]);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setError(null);
    setMessages([]);
    try {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${projectId}`);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  if (!open) return null;

  return (
    <div className="card flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-primary">📚 {t('rag_panel_title')}</h3>
          <span className="text-[11px] text-muted shrink-0">
            {t('rag_indexed_count').replace('{count}', String(indexedCount))}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={clearChat}
            disabled={messages.length === 0 || busy}
            className="text-[11px] text-muted hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('rag_clear_chat')}
          >
            🗑 {t('rag_clear_chat')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-lg leading-none text-muted hover:text-primary"
            aria-label="×"
          >
            ×
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto p-3">
        {indexedCount === 0 && (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('rag_no_pdfs')}
          </p>
        )}

        {messages.length === 0 && !busy && indexedCount > 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted">{t('rag_history_empty')}</p>
        )}

        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            role={m.role}
            content={m.content}
            citations={m.citations}
            onCiteClick={onCiteClick}
          />
        ))}

        {busy && (
          <div className="flex flex-col items-start">
            <div className="rounded-2xl rounded-bl-sm bg-white border border-border px-3 py-2 text-sm text-muted">
              {t('rag_thinking')}
              <span className="ml-1 inline-flex gap-0.5">
                <Dot />
                <Dot delay={150} />
                <Dot delay={300} />
              </span>
            </div>
          </div>
        )}

        {error && !busy && (
          <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="border-t border-border p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('rag_input_placeholder')}
            rows={2}
            disabled={indexedCount === 0}
            className="flex-1 resize-none rounded border border-border bg-transparent px-2 py-1.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-teal disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || indexedCount === 0 || input.trim().length === 0}
            className="shrink-0 rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('rag_send')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }): JSX.Element {
  return (
    <span
      className="inline-block w-1 h-1 rounded-full bg-muted rag-dot"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

// Refs don't carry their own bibliography number (that depends on citation
// order in the manuscript). Fall back to the index in the refs array so the
// chip is still meaningful in an empty document.
function refOrderNumber(ref: Ref, fallback?: number): number | undefined {
  if (typeof ref.enRecNum === 'number' && ref.enRecNum > 0) return ref.enRecNum;
  return fallback;
}
