'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Phrase, PhraseCategory, UserPhrasebank } from '@/store/types';
import {
  createPhrasebank,
  deletePhrasebank,
  listPhrasebanks,
  setActivePhrasebank,
  updatePhrasebank,
} from '@/store/db';
import { newId } from '@/lib/id';
import { extractPdfText } from '@/lib/phrasebank/pdf';
import { countPhrases, parsePhrasebankText } from '@/lib/phrasebank/parse';
import { categoryMatchesSection } from '@/lib/phrasebank/context';

type Props = {
  onInsert: (text: string) => void;
  onClose: () => void;
  currentSection?: string | null;
  t: (k: any) => string;
};

type UploadState =
  | { status: 'idle' }
  | { status: 'busy'; label: string }
  | { status: 'error'; message: string }
  | { status: 'done'; message: string };

type BundledPhrasebank = {
  name: string;
  sourceFileName?: string;
  categories: Array<{ name: string; phrases: string[] }>;
};

function phraseScore(phrase: Phrase, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const haystack = `${phrase.text} ${phrase.category} ${(phrase.tags ?? []).join(' ')}`.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length;
  }
  return score === 0 ? -1 : score;
}

function phrasebankBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Phrasebank';
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return '';
  }
}

function hydrateBundledCategories(bundle: BundledPhrasebank): PhraseCategory[] {
  return bundle.categories.map((category) => ({
    id: newId('pcat'),
    name: category.name,
    phrases: category.phrases.map((text) => ({
      id: newId('phrase'),
      text,
      category: category.name,
    })),
  }));
}

export function PhrasebankPanel({ onInsert, onClose, currentSection, t }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [banks, setBanks] = useState<UserPhrasebank[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [upload, setUpload] = useState<UploadState>({ status: 'idle' });
  const [bundledBusy, setBundledBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const active = useMemo(
    () => banks.find((bank) => bank.id === activeId) ?? banks.find((bank) => bank.active) ?? banks[0] ?? null,
    [banks, activeId],
  );

  const reload = async (): Promise<void> => {
    const rows = await listPhrasebanks();
    setBanks(rows);
    const nextActive = rows.find((bank) => bank.active) ?? rows[0] ?? null;
    setActiveId((id) => (id && rows.some((bank) => bank.id === id) ? id : nextActive?.id ?? ''));
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!active) return;
    setOpenCategories(new Set(active.categories.map((cat) => cat.id)));
  }, [active?.id]);

  const categories = active?.categories ?? [];
  const filteredCategories = useMemo(() => {
    const mapped = categories
      .filter((cat) => !categoryFilter || cat.name === categoryFilter)
      .map((cat) => {
        const phrases = cat.phrases
          .map((phrase) => ({ phrase, score: phraseScore(phrase, query) }))
          .filter((item) => item.score >= 0)
          .sort((a, b) => b.score - a.score)
          .map((item) => item.phrase);
        return { ...cat, phrases, recommended: categoryMatchesSection(cat.name, currentSection) };
      })
      .filter((cat) => cat.phrases.length > 0);
    return mapped.sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name));
  }, [categories, categoryFilter, currentSection, query]);

  async function importPdf(file: File): Promise<void> {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setUpload({ status: 'error', message: t('pb_pdf_only') });
      return;
    }
    setUpload({ status: 'busy', label: t('pb_extracting') });
    try {
      const text = await extractPdfText(file);
      setUpload({ status: 'busy', label: t('pb_parsing') });
      const categories = parsePhrasebankText(text);
      const total = countPhrases(categories);
      if (total === 0) throw new Error(t('pb_no_phrases'));
      const bank = await createPhrasebank({
        name: phrasebankBaseName(file.name),
        categories,
        sourceFileName: file.name,
        active: true,
      });
      await reload();
      setActiveId(bank.id);
      setUpload({ status: 'done', message: t('pb_imported').replace('{count}', String(total)) });
      setQuery('');
      setCategoryFilter('');
    } catch (err) {
      setUpload({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function switchBank(id: string): Promise<void> {
    setActiveId(id);
    await setActivePhrasebank(id);
    await reload();
  }

  async function installBundledPhrasebank(): Promise<void> {
    setBundledBusy(true);
    setUpload({ status: 'busy', label: t('pb_installing_bundle') });
    try {
      const res = await fetch('/phrasebanks/academic-phrasebank.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle = (await res.json()) as BundledPhrasebank;
      const categories = hydrateBundledCategories(bundle);
      const total = countPhrases(categories);
      const bank = await createPhrasebank({
        name: bundle.name,
        sourceFileName: bundle.sourceFileName,
        categories,
        active: true,
      });
      await reload();
      setActiveId(bank.id);
      setUpload({ status: 'done', message: t('pb_imported').replace('{count}', String(total)) });
    } catch (err) {
      setUpload({ status: 'error', message: t('pb_bundle_failed').replace('{msg}', err instanceof Error ? err.message : String(err)) });
    } finally {
      setBundledBusy(false);
    }
  }

  async function mutateActive(categories: PhraseCategory[]): Promise<void> {
    if (!active) return;
    await updatePhrasebank(active.id, { categories });
    await reload();
  }

  async function removePhrase(categoryId: string, phraseId: string): Promise<void> {
    if (!active) return;
    const next = active.categories
      .map((cat) =>
        cat.id === categoryId
          ? { ...cat, phrases: cat.phrases.filter((phrase) => phrase.id !== phraseId) }
          : cat,
      )
      .filter((cat) => cat.phrases.length > 0);
    await mutateActive(next);
  }

  async function removeCategory(categoryId: string): Promise<void> {
    if (!active) return;
    const target = active.categories.find((cat) => cat.id === categoryId);
    if (!target) return;
    if (!confirm(t('pb_delete_category_confirm').replace('{name}', target.name))) return;
    await mutateActive(active.categories.filter((cat) => cat.id !== categoryId));
  }

  async function renameCategory(categoryId: string): Promise<void> {
    if (!active) return;
    const target = active.categories.find((cat) => cat.id === categoryId);
    if (!target) return;
    const name = prompt(t('pb_rename_category'), target.name)?.trim();
    if (!name || name === target.name) return;
    await mutateActive(
      active.categories.map((cat) =>
        cat.id === categoryId
          ? {
              ...cat,
              name,
              phrases: cat.phrases.map((phrase) => ({ ...phrase, category: name })),
            }
          : cat,
      ),
    );
  }

  async function removeBank(): Promise<void> {
    if (!active) return;
    if (!confirm(t('pb_delete_bank_confirm').replace('{name}', active.name))) return;
    await deletePhrasebank(active.id);
    await reload();
  }

  async function copyPhrase(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setUpload({ status: 'done', message: t('pb_copied') });
    } catch {
      setUpload({ status: 'error', message: t('pb_copy_failed') });
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void importPdf(file);
  }

  return (
    <div className="card flex flex-col h-full bg-white">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-primary text-sm">§ {t('pb_title')}</h3>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">
          ×
        </button>
      </div>

      <div className="p-3 border-b border-border space-y-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`border border-dashed rounded-lg px-3 py-3 text-center transition ${
            dragging ? 'border-teal bg-teal-bg' : 'border-border bg-slate-50'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importPdf(file);
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={upload.status === 'busy'}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {upload.status === 'busy' ? upload.label : t('pb_upload_pdf')}
          </button>
          <button
            onClick={() => void installBundledPhrasebank()}
            disabled={upload.status === 'busy' || bundledBusy}
            className="btn-secondary text-xs px-3 py-1.5 ml-2 disabled:opacity-50"
          >
            {bundledBusy ? t('pb_installing_bundle') : t('pb_install_bundle')}
          </button>
          <div className="text-[11px] text-muted mt-1">{t('pb_drop_hint')}</div>
        </div>

        {upload.status === 'error' && <div className="text-xs text-red">{upload.message}</div>}
        {upload.status === 'done' && <div className="text-xs text-teal">{upload.message}</div>}

        <div className="flex items-center gap-2">
          <select
            value={active?.id ?? ''}
            onChange={(e) => void switchBank(e.target.value)}
            className="min-w-0 flex-1 border border-border rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-teal"
            disabled={banks.length === 0}
          >
            {banks.length === 0 ? (
              <option value="">{t('pb_no_banks')}</option>
            ) : (
              banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name} ({countPhrases(bank.categories)})
                </option>
              ))
            )}
          </select>
          {active && (
            <button onClick={removeBank} className="btn-danger text-xs px-2 py-1" title={t('pb_delete_bank')}>
              {t('pb_delete')}
            </button>
          )}
        </div>

        {active && (
          <div className="text-[11px] text-muted truncate">
            {t('pb_active')}: <span className="font-semibold text-secondary">{active.name}</span>
            {active.sourceFileName ? ` · ${active.sourceFileName}` : ''} · {formatTime(active.updatedAt)}
          </div>
        )}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('pb_search_placeholder')}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-teal"
        />

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          disabled={!active || categories.length === 0}
          className="w-full border border-border rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-teal"
        >
          <option value="">{t('pb_all_categories')}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.name}>
              {cat.name} ({cat.phrases.length})
            </option>
          ))}
        </select>

        {currentSection && (
          <div className="text-[11px] text-muted">
            {t('pb_context')}: <span className="font-semibold text-secondary">{currentSection}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {!active && <p className="px-3 py-6 text-center text-xs text-muted">{t('pb_empty')}</p>}
        {active && filteredCategories.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted">{t('pb_no_matches')}</p>
        )}
        {filteredCategories.map((cat) => {
          const open = openCategories.has(cat.id);
          return (
            <div key={cat.id} className="border-b border-border">
              <div className={`px-3 py-2 ${cat.recommended ? 'bg-teal-bg' : ''}`}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setOpenCategories((prev) => {
                        const next = new Set(prev);
                        if (next.has(cat.id)) next.delete(cat.id);
                        else next.add(cat.id);
                        return next;
                      });
                    }}
                    className="text-xs text-secondary hover:text-primary flex-1 min-w-0 text-left font-semibold truncate"
                  >
                    {open ? '▾' : '▸'} {cat.name} ({cat.phrases.length})
                  </button>
                  {cat.recommended && (
                    <span className="text-[10px] rounded bg-white border border-teal text-teal px-1.5 py-0.5">
                      {t('pb_relevant')}
                    </span>
                  )}
                  <button onClick={() => void renameCategory(cat.id)} className="text-xs text-muted hover:text-primary">
                    {t('rp_edit')}
                  </button>
                  <button onClick={() => void removeCategory(cat.id)} className="text-xs text-red hover:underline">
                    {t('pb_delete')}
                  </button>
                </div>
              </div>
              {open && (
                <div>
                  {cat.phrases.map((phrase) => (
                    <div key={phrase.id} className="px-3 py-2 border-t border-border text-xs">
                      <p className="text-secondary leading-relaxed whitespace-pre-wrap">{phrase.text}</p>
                      {phrase.tags && phrase.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {phrase.tags.map((tag) => (
                            <span key={tag} className="rounded bg-slate-100 text-muted px-1.5 py-0.5 text-[10px]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        <button onClick={() => onInsert(phrase.text)} className="text-teal hover:underline font-semibold">
                          {t('pb_insert')}
                        </button>
                        <button onClick={() => void copyPhrase(phrase.text)} className="text-secondary hover:text-primary">
                          {t('pb_copy')}
                        </button>
                        <button
                          onClick={() => void removePhrase(cat.id, phrase.id)}
                          className="text-red hover:underline ml-auto"
                        >
                          {t('pb_delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
