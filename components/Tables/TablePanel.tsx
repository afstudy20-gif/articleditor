'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectTable } from '@/store/types';
import { parseTable, tiptapTableToRows, rowsToTiptapTable, type ParsedTable } from '@/lib/tables/parse-table';
import { parseDocxTables } from '@/lib/tables/import-docx';
import { projectTableFromParsed } from '@/lib/tables/project-tables';
import {
  styledTableHtml,
  tableToLatex,
  tableToCsv,
  tableToTsv,
  copyStyledTable,
  type TableStyle,
  type StyledTableOptions,
} from '@/lib/tables/export-table';

// ─── Types ──────────────────────────────────────────────────

interface TableEntry {
  pos: number;
  index: number;        // 1-based
  rows: string[][];
  hasHeader: boolean;
  title: string;
  footnote: string;
  node: any;
}

interface TablePanelProps {
  editor: any;
  storedTables: ProjectTable[];
  onStoredTablesChange: (tables: ProjectTable[]) => void;
  onClose: () => void;
  t: (k: string) => string;
  lang?: 'tr' | 'en';
  initialView?: ViewMode;
}

/** Read a File into a base64 data URL. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

type ViewMode = 'list' | 'edit' | 'import';

// ─── Helpers ────────────────────────────────────────────────

function collectTables(editor: any): TableEntry[] {
  if (!editor) return [];
  const items: TableEntry[] = [];
  let tableIndex = 0;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.type?.name === 'table') {
      tableIndex++;
      const { rows, hasHeader } = tiptapTableToRows(node.toJSON());
      items.push({
        pos,
        index: tableIndex,
        rows,
        hasHeader,
        title: node.attrs?.title ?? '',
        footnote: node.attrs?.footnote ?? '',
        node,
      });
      return false; // don't descend into table
    }
    return true;
  });
  return items;
}

function rowsToPlainText(rows: string[][]): string {
  return rows.map((r) => r.join('\t')).join('\n');
}

function tableSignature(table: Pick<ProjectTable, 'rows' | 'title' | 'footnote'>): string {
  return JSON.stringify({
    title: table.title ?? '',
    footnote: table.footnote ?? '',
    rows: table.rows,
  });
}

// ─── Main Panel ─────────────────────────────────────────────

export function TablePanel({
  editor,
  storedTables,
  onStoredTablesChange,
  onClose,
  t,
  lang = 'tr',
  initialView = 'list',
}: TablePanelProps): JSX.Element {
  const [tables, setTables] = useState<TableEntry[]>(() => collectTables(editor));
  const [view, setView] = useState<ViewMode>(initialView);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<ParsedTable | null>(null);
  const [importTitle, setImportTitle] = useState('');
  const [importFootnote, setImportFootnote] = useState('');
  const [blankRows, setBlankRows] = useState(3);
  const [blankCols, setBlankCols] = useState(3);
  const [wordTables, setWordTables] = useState<ParsedTable[]>([]);
  const [wordTableIndex, setWordTableIndex] = useState(0);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [exportStyle, setExportStyle] = useState<TableStyle>('three-line');
  const [editTitle, setEditTitle] = useState('');
  const [editFootnote, setEditFootnote] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const appendStoredTables = useCallback((items: ProjectTable[]) => {
    if (items.length === 0) return;
    const seen = new Set(storedTables.map(tableSignature));
    const next = [...storedTables];
    for (const item of items) {
      const signature = tableSignature(item);
      if (seen.has(signature)) continue;
      seen.add(signature);
      next.push(item);
    }
    onStoredTablesChange(next);
  }, [onStoredTablesChange, storedTables]);

  const removeStoredTable = useCallback((id: string) => {
    onStoredTablesChange(storedTables.filter((table) => table.id !== id));
  }, [onStoredTablesChange, storedTables]);

  // Refresh table list on editor changes
  useEffect(() => {
    if (!editor) return undefined;
    const refresh = () => setTables(collectTables(editor));
    editor.on('update', refresh);
    refresh();
    return () => editor.off('update', refresh);
  }, [editor]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  // ─── Import ───────────────────────────────────────────────

  const handleImportTextChange = useCallback((text: string) => {
    setImportText(text);
    setWordTables([]);
    setWordTableIndex(0);
    setImportError('');
    const parsed = parseTable(text);
    setImportPreview(parsed);
  }, []);

  // Extract a table from an image via the vision AI route, then drop the
  // result into the existing import-preview pipeline (same as file/paste).
  const extractTableFromImage = useCallback(async (file: File) => {
    if (!/^image\//.test(file.type)) {
      setImportError(t('tbl_image_unsupported'));
      return;
    }
    setImageBusy(true);
    setImportError('');
    setWordTables([]);
    setWordTableIndex(0);
    setImportPreview(null);
    setImportText('');
    try {
      const dataUrl = await fileToDataUrl(file);
      setImagePreviewUrl(dataUrl);
      const res = await fetch('/api/ai/image-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl, lang }),
      });
      const data = await res.json();
      if (!res.ok || !data.table) {
        setImportError(data?.error ?? t('tbl_image_failed'));
        return;
      }
      const table = data.table as ParsedTable;
      setImportPreview(table);
      setImportTitle(table.title ?? '');
      setImportFootnote(table.footnote ?? '');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setImportError(`${t('tbl_image_failed')} (${errMsg})`);
    } finally {
      setImageBusy(false);
    }
  }, [lang, t]);

  const handleImageInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await extractTableFromImage(file);
  }, [extractTableFromImage]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    // Pasted image (screenshot) → vision extraction.
    const imageItem = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        await extractTableFromImage(file);
        return;
      }
    }
    // Try HTML first (Word/Excel clipboard)
    const html = e.clipboardData.getData('text/html');
    if (html && /<table/i.test(html)) {
      e.preventDefault();
      const parsed = parseTable(html);
      if (parsed) {
        setWordTables([]);
        setWordTableIndex(0);
        setImportError('');
        setImportPreview(parsed);
        setImportText(rowsToPlainText(parsed.rows));
        return;
      }
    }
    // Fall through to plain text handling via onChange
  }, []);

  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportBusy(true);
    setImportError('');
    setWordTables([]);
    setWordTableIndex(0);
    try {
      if (/\.docx$/i.test(file.name)) {
        const tables = await parseDocxTables(await file.arrayBuffer());
        if (tables.length === 0) {
          setImportPreview(null);
          setImportText('');
          setImportError(t('tbl_word_no_tables'));
          return;
        }
        setWordTables(tables);
        setImportPreview(null);
        setImportTitle('');
        setImportFootnote('');
        setImportText('');
        return;
      }

      const text = await file.text();
      setImportText(text);
      const parsed = parseTable(text);
      setImportPreview(parsed);
      setImportTitle(parsed?.title ?? '');
      setImportFootnote(parsed?.footnote ?? '');
      if (!parsed) setImportError(t('tbl_import_invalid'));
    } catch (err: unknown) {
      setImportPreview(null);
      setImportText('');
      const errMsg = err instanceof Error ? err.message : String(err);
      setImportError(`${t('tbl_import_failed')} (${errMsg})`);
    } finally {
      setImportBusy(false);
    }
  }, [t]);

  const toggleImportHeader = useCallback((hasHeader: boolean) => {
    setImportPreview((current) => current ? { ...current, hasHeader } : current);
    setWordTables((current) =>
      current.map((table, index) =>
        index === wordTableIndex ? { ...table, hasHeader } : table,
      ),
    );
  }, [wordTableIndex]);

  const updateWordTable = useCallback((index: number, patch: Partial<ParsedTable>) => {
    setWordTables((current) =>
      current.map((table, tableIndex) =>
        tableIndex === index ? { ...table, ...patch } : table,
      ),
    );
  }, []);

  const storeImportedTable = useCallback(() => {
    if (!importPreview) return;
    appendStoredTables([projectTableFromParsed({
      ...importPreview,
      title: importTitle,
      footnote: importFootnote,
    })]);
    setView('list');
    setImportText('');
    setImportPreview(null);
    setImportTitle('');
    setImportFootnote('');
    setWordTables([]);
    setWordTableIndex(0);
    setImportError('');
  }, [appendStoredTables, importPreview, importTitle, importFootnote]);

  const storeAllImportedTables = useCallback(() => {
    if (wordTables.length === 0) return;
    appendStoredTables(wordTables.map((table) => projectTableFromParsed(table)));
    setView('list');
    setImportText('');
    setImportPreview(null);
    setImportTitle('');
    setImportFootnote('');
    setWordTables([]);
    setWordTableIndex(0);
    setImportError('');
  }, [appendStoredTables, wordTables]);

  const insertStoredTable = useCallback((table: ProjectTable) => {
    if (!editor) return;
    const tableJson = rowsToTiptapTable(table.rows, table.hasHeader, {
      title: table.title,
      footnote: table.footnote,
    });
    if (!tableJson) return;
    editor.chain().focus().insertContent(tableJson).run();
  }, [editor]);

  const createBlankTablePreview = useCallback(() => {
    const rows = Math.min(Math.max(blankRows, 1), 50);
    const cols = Math.min(Math.max(blankCols, 1), 20);
    setWordTables([]);
    setWordTableIndex(0);
    setImportError('');
    setImportText('');
    setImportPreview({
      rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
      hasHeader: true,
      format: 'text',
    });
  }, [blankRows, blankCols]);

  // ─── Export ───────────────────────────────────────────────

  const activeTable = editIndex !== null ? tables.find((t) => t.index === editIndex) : null;

  const exportOpts = useCallback(
    (tbl: TableEntry): StyledTableOptions => ({
      style: exportStyle,
      title: editTitle || `Table ${tbl.index}`,
      footnote: editFootnote || undefined,
      hasHeader: tbl.hasHeader,
    }),
    [exportStyle, editTitle, editFootnote],
  );

  const openTableEditor = (tbl: TableEntry) => {
    setEditIndex(tbl.index);
    setEditTitle(tbl.title);
    setEditFootnote(tbl.footnote);
    setView('edit');
  };

  const updateTableMetadata = (
    tbl: TableEntry,
    field: 'title' | 'footnote',
    value: string,
  ) => {
    const node = editor.state.doc.nodeAt(tbl.pos);
    if (!node || node.type?.name !== 'table') return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(tbl.pos, undefined, {
        ...node.attrs,
        [field]: value,
      }),
    );
    if (field === 'title') setEditTitle(value);
    else setEditFootnote(value);
  };

  const flashCopy = (msg: string) => {
    setCopyMsg(msg);
    setTimeout(() => setCopyMsg(''), 2000);
  };

  const copyAsStyled = async (tbl: TableEntry) => {
    const html = styledTableHtml(tbl.rows, exportOpts(tbl));
    const plain = rowsToPlainText(tbl.rows);
    const ok = await copyStyledTable(html, plain);
    flashCopy(ok ? t('tbl_copied') : t('tbl_copy_fail'));
  };

  const copyAsLatex = async (tbl: TableEntry) => {
    const latex = tableToLatex(tbl.rows, exportOpts(tbl));
    try {
      await navigator.clipboard.writeText(latex);
      flashCopy(t('tbl_copied'));
    } catch {
      flashCopy(t('tbl_copy_fail'));
    }
  };

  const copyAsCsv = async (tbl: TableEntry) => {
    const csv = tableToCsv(tbl.rows);
    try {
      await navigator.clipboard.writeText(csv);
      flashCopy(t('tbl_copied'));
    } catch {
      flashCopy(t('tbl_copy_fail'));
    }
  };

  const downloadCsv = (tbl: TableEntry) => {
    const csv = tableToCsv(tbl.rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `table-${tbl.index}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTsv = (tbl: TableEntry) => {
    const tsv = tableToTsv(tbl.rows);
    const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `table-${tbl.index}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Convert text ↔ table ────────────────────────────────

  const convertSelectionToTable = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n');
    if (!text.trim()) return;

    const parsed = parseTable(text);
    if (!parsed) {
      // Fallback: try splitting by newlines → single-column table
      const lines = text.split(/\r?\n/).filter((l: string) => l.trim());
      if (lines.length < 2) return;
      const rows = lines.map((l: string) => [l.trim()]);
      const tableJson = rowsToTiptapTable(rows, false);
      if (tableJson) {
        editor.chain().focus().deleteSelection().insertContent(tableJson).run();
      }
      return;
    }

    const tableJson = rowsToTiptapTable(parsed.rows, parsed.hasHeader);
    if (tableJson) {
      editor.chain().focus().deleteSelection().insertContent(tableJson).run();
    }
  }, [editor]);

  const convertTableToText = useCallback(
    (tbl: TableEntry) => {
      if (!editor) return;
      const plain = rowsToPlainText(tbl.rows);
      // Select the table node and replace with text
      editor.chain().focus().setNodeSelection(tbl.pos).deleteSelection().insertContent(plain).run();
    },
    [editor],
  );

  // ─── Jump to table ───────────────────────────────────────

  const jumpToTable = (pos: number) => {
    editor.chain().focus().setNodeSelection(pos).scrollIntoView().run();
  };

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="card flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-primary text-sm">⊞ {t('tbl_title')}</h3>
          <div className="flex rounded-md border border-border text-[10px] overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-2 py-0.5 ${view === 'list' ? 'bg-teal text-white' : 'hover:bg-slate-50'}`}
            >
              {t('tbl_list')}
            </button>
            <button
              onClick={() => setView('import')}
              className={`px-2 py-0.5 border-l border-border ${view === 'import' ? 'bg-teal text-white' : 'hover:bg-slate-50'}`}
            >
              {t('tbl_import')}
            </button>
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-primary text-lg leading-none">×</button>
      </div>

      {/* Copy flash message */}
      {copyMsg && (
        <div className="px-3 py-1.5 bg-teal-bg text-teal text-xs text-center font-medium">{copyMsg}</div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="flex-1 overflow-auto">
          {storedTables.length > 0 && (
            <div className="border-b border-border">
              <div className="px-3 py-2 bg-slate-50 border-b border-border">
                <div className="text-xs font-semibold text-primary">{t('tbl_stored_tables')} ({storedTables.length})</div>
                <div className="text-[10px] text-muted mt-0.5">{t('tbl_stored_hint')}</div>
              </div>
              <div className="p-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
                {storedTables.map((table, index) => (
                  <StoredTableCard
                    key={table.id}
                    table={table}
                    index={index + 1}
                    t={t}
                    onInsert={() => insertStoredTable(table)}
                    onDelete={() => removeStoredTable(table.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {tables.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-xs text-muted mb-3">
                {storedTables.length > 0 ? t('tbl_no_inserted_tables') : t('tbl_empty')}
              </p>
              <button
                onClick={() => setView('import')}
                className="text-xs text-teal hover:underline"
              >
                {t('tbl_import_hint')}
              </button>
            </div>
          ) : (
            <div>
              <div className="px-3 py-2 bg-slate-50 border-b border-border text-xs font-semibold text-primary">
                {t('tbl_inserted_tables')} ({tables.length})
              </div>
              {tables.map((tbl) => (
                <div key={tbl.pos} className="border-b border-border">
                  {/* Table summary row */}
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-primary text-xs">
                        Table {tbl.index}
                        <span className="text-muted font-normal ml-2">
                          {tbl.rows.length}×{tbl.rows[0]?.length ?? 0}
                        </span>
                      </div>
                      {/* Preview first row */}
                      {tbl.rows[0] && (
                        <div className="text-[10px] text-muted mt-0.5 truncate">
                          {tbl.rows[0].slice(0, 4).join(' | ')}
                          {tbl.rows[0].length > 4 ? ' …' : ''}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => jumpToTable(tbl.pos)}
                        className="text-[10px] text-teal hover:underline"
                      >
                        {t('tbl_jump')}
                      </button>
                      <button
                        onClick={() => openTableEditor(tbl)}
                        className="text-[10px] text-secondary hover:text-primary"
                      >
                        {t('tbl_export')}
                      </button>
                    </div>
                  </div>

                  {/* Inline mini preview */}
                  <div className="px-3 pb-2 overflow-x-auto">
                    <table className="text-[9px] border-collapse w-full">
                      <tbody>
                        {tbl.rows.slice(0, 4).map((row, ri) => (
                          <tr key={ri} className={ri === 0 && tbl.hasHeader ? 'font-semibold border-b border-border' : ''}>
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-1 py-0.5 text-muted truncate max-w-[80px]">{cell}</td>
                            ))}
                          </tr>
                        ))}
                        {tbl.rows.length > 4 && (
                          <tr>
                            <td colSpan={tbl.rows[0]?.length} className="text-center text-muted italic px-1 py-0.5">
                              +{tbl.rows.length - 4} {t('tbl_more_rows')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Convert selection to table */}
          <div className="px-3 py-2 border-t border-border">
            <button
              onClick={convertSelectionToTable}
              className="text-xs text-secondary hover:text-teal"
              title={t('tbl_text_to_table_hint')}
            >
              📋 {t('tbl_text_to_table')}
            </button>
          </div>
        </div>
      )}

      {/* Edit / Export View */}
      {view === 'edit' && activeTable && (
        <div className="flex-1 overflow-auto">
          <div className="px-3 py-2 border-b border-border">
            <button onClick={() => setView('list')} className="text-xs text-teal hover:underline">
              ← {t('tbl_back')}
            </button>
            <span className="text-xs text-primary font-semibold ml-2">
              Table {activeTable.index} ({activeTable.rows.length}×{activeTable.rows[0]?.length ?? 0})
            </span>
          </div>

          {/* Style picker */}
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[10px] text-muted font-semibold">{t('tbl_style')}:</label>
              {(['three-line', 'apa', 'grid', 'plain'] as TableStyle[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setExportStyle(s)}
                  className={`text-[10px] px-2 py-0.5 rounded border ${
                    exportStyle === s ? 'bg-teal text-white border-teal' : 'border-border hover:bg-slate-50'
                  }`}
                >
                  {s === 'three-line' ? 'Three-line' : s === 'apa' ? 'APA' : s === 'grid' ? 'Grid' : 'Plain'}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder={t('tbl_title_placeholder')}
              value={editTitle}
              onChange={(e) => updateTableMetadata(activeTable, 'title', e.target.value)}
              className="w-full text-xs px-2 py-1 border border-border rounded"
            />
            <textarea
              placeholder={t('tbl_footnote_placeholder')}
              value={editFootnote}
              onChange={(e) => updateTableMetadata(activeTable, 'footnote', e.target.value)}
              className="w-full min-h-16 resize-y text-xs px-2 py-1 border border-border rounded"
            />
            <p className="text-[10px] leading-relaxed text-muted">{t('tbl_metadata_hint')}</p>
          </div>

          {/* Preview */}
          <div className="px-3 py-2 border-t border-border">
            <div className="text-[10px] text-muted font-semibold mb-1">{t('tbl_preview')}</div>
            <div
              className="text-xs overflow-auto max-h-48 border border-border rounded p-2"
              dangerouslySetInnerHTML={{
                __html: styledTableHtml(activeTable.rows, exportOpts(activeTable)),
              }}
            />
          </div>

          {/* Export actions */}
          <div className="px-3 py-2 border-t border-border space-y-1">
            <div className="text-[10px] text-muted font-semibold mb-1">{t('tbl_export_actions')}</div>
            <div className="flex flex-wrap gap-1">
              <ExBtn onClick={() => copyAsStyled(activeTable)} label={t('tbl_copy_styled')} />
              <ExBtn onClick={() => copyAsLatex(activeTable)} label={t('tbl_copy_latex')} />
              <ExBtn onClick={() => copyAsCsv(activeTable)} label={t('tbl_copy_csv')} />
              <ExBtn onClick={() => downloadCsv(activeTable)} label={t('tbl_download_csv')} />
              <ExBtn onClick={() => downloadTsv(activeTable)} label={t('tbl_download_tsv')} />
            </div>
          </div>

          {/* Convert to text */}
          <div className="px-3 py-2 border-t border-border">
            <button
              onClick={() => { convertTableToText(activeTable); setView('list'); }}
              className="text-xs text-red hover:underline"
            >
              {t('tbl_to_text')}
            </button>
          </div>
        </div>
      )}

      {/* Import View */}
      {view === 'import' && (
        <div className="flex-1 overflow-auto">
          <div className="px-3 py-2 border-b border-border">
            <button onClick={() => setView('list')} className="text-xs text-teal hover:underline">
              ← {t('tbl_back')}
            </button>
          </div>

          <div className="px-3 py-2 space-y-2">
            <p className="text-xs text-muted">{t('tbl_import_desc')}</p>

            <div className="rounded-md border border-border bg-slate-50 p-2">
              <div className="mb-1.5 text-[10px] font-semibold text-primary">{t('tbl_blank_table')}</div>
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1 text-[10px] text-secondary">
                  {t('tbl_rows')}
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={blankRows}
                    onChange={(e) => setBlankRows(Number(e.target.value) || 1)}
                    className="w-14 rounded border border-border bg-white px-1.5 py-1 text-xs"
                  />
                </label>
                <label className="flex items-center gap-1 text-[10px] text-secondary">
                  {t('tbl_columns')}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={blankCols}
                    onChange={(e) => setBlankCols(Number(e.target.value) || 1)}
                    className="w-14 rounded border border-border bg-white px-1.5 py-1 text-xs"
                  />
                </label>
                <button
                  type="button"
                  onClick={createBlankTablePreview}
                  className="ml-auto rounded bg-white px-2 py-1 text-[10px] font-semibold text-teal border border-teal/40 hover:bg-teal-bg"
                >
                  {t('tbl_create_blank')}
                </button>
              </div>
            </div>

            <textarea
              value={importText}
              onChange={(e) => handleImportTextChange(e.target.value)}
              onPaste={handlePaste}
              placeholder={t('tbl_import_placeholder')}
              className="w-full text-xs px-2 py-1.5 border border-border rounded h-28 resize-none font-mono"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={importBusy}
                className="text-xs px-2 py-1 border border-border rounded hover:bg-slate-50"
              >
                📂 {importBusy ? t('tbl_import_processing') : t('tbl_import_file')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.csv,.tsv,.txt,.html,.htm"
                className="hidden"
                onChange={handleFileImport}
              />
              <button
                onClick={() => imageRef.current?.click()}
                disabled={imageBusy}
                title={t('tbl_image_hint')}
                className="text-xs px-2 py-1 border border-teal text-teal rounded hover:bg-teal-bg disabled:opacity-50"
              >
                🖼️ {imageBusy ? t('tbl_image_processing') : t('tbl_image_button')}
              </button>
              <input
                ref={imageRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleImageInput}
              />
              {importPreview && (
                <span className="text-[10px] text-teal">
                  ✓ {importPreview.rows.length}×{importPreview.rows[0]?.length ?? 0} ({importPreview.format})
                </span>
              )}
            </div>

            <p className="text-[10px] text-muted">{t('tbl_image_hint')}</p>

            {imagePreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreviewUrl}
                alt={t('tbl_image_button')}
                className="max-h-40 w-auto rounded border border-border"
              />
            )}

            {importError && (
              <p className="text-[10px] text-red">{importError}</p>
            )}

            {wordTables.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] text-muted font-semibold">
                    {t('tbl_word_tables_found').replace('{count}', String(wordTables.length))}
                  </div>
                  <button
                    onClick={storeAllImportedTables}
                    className="text-[10px] px-2 py-1 border border-teal text-teal hover:bg-teal-bg rounded font-semibold"
                  >
                    {t('tbl_save_all_tables')}
                  </button>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {wordTables.map((table, index) => (
                    <ImportTableCard
                      key={index}
                      table={table}
                      index={index + 1}
                      t={t}
                      onChange={(patch) => updateWordTable(index, patch)}
                      onSave={() => appendStoredTables([projectTableFromParsed(table)])}
                      onInsert={() => {
                        const tableJson = rowsToTiptapTable(table.rows, table.hasHeader, {
                          title: table.title,
                          footnote: table.footnote,
                        });
                        if (tableJson) editor.chain().focus().insertContent(tableJson).run();
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Import preview */}
          {importPreview && (
            <div className="px-3 py-2 border-t border-border space-y-2">
              <div className="text-[10px] text-muted font-semibold">{t('tbl_preview')}</div>

              <div>
                <input
                  type="text"
                  value={importTitle}
                  onChange={(e) => setImportTitle(e.target.value)}
                  placeholder={t('tbl_title_placeholder')}
                  className="w-full text-xs px-2 py-1.5 border border-border rounded"
                />
              </div>

              <div>
                <textarea
                  value={importFootnote}
                  onChange={(e) => setImportFootnote(e.target.value)}
                  placeholder={t('tbl_footnote_placeholder')}
                  className="w-full min-h-12 resize-y text-xs px-2 py-1.5 border border-border rounded"
                />
              </div>

              <label className="flex items-center gap-1.5 text-[10px] text-secondary pt-1">
                <input
                  type="checkbox"
                  checked={importPreview.hasHeader}
                  onChange={(e) => toggleImportHeader(e.target.checked)}
                />
                {t('tbl_first_row_header')}
              </label>
              <div className="overflow-auto max-h-40 border border-border rounded">
                <table className="text-[9px] border-collapse w-full">
                  {importPreview.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={ri === 0 && importPreview.hasHeader ? 'font-semibold bg-slate-50 border-b border-border' : ''}
                    >
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-1.5 py-0.5 border-b border-border/50">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </table>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={storeImportedTable}
                  className="flex-1 text-xs px-3 py-1.5 bg-teal text-white rounded hover:bg-teal-dark font-semibold"
                >
                  {t('tbl_save_to_memory')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Small components ───────────────────────────────────────

function StoredTableCard({
  table,
  index,
  t,
  onInsert,
  onDelete,
}: {
  table: ProjectTable;
  index: number;
  t: (k: string) => string;
  onInsert: () => void;
  onDelete: () => void;
}): JSX.Element {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-white">
      <div className="px-3 py-2 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-primary truncate">
            {table.title || `${t('tbl_word_table')} ${index}`}
          </div>
          <div className="text-[10px] text-muted mt-0.5">
            {table.rows.length}×{table.rows[0]?.length ?? 0}
            {table.source ? ` · ${table.source}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[10px]">
          <button onClick={onInsert} className="font-semibold text-teal hover:underline">
            {t('tbl_insert_to_editor')} →
          </button>
          <button onClick={onDelete} className="text-red hover:underline">
            {t('tbl_delete_stored')}
          </button>
        </div>
      </div>
      <TableRowsPreview rows={table.rows} hasHeader={table.hasHeader} />
      {table.footnote && (
        <div className="px-3 py-2 border-t border-border text-[10px] text-muted leading-relaxed">
          {table.footnote}
        </div>
      )}
    </div>
  );
}

function ImportTableCard({
  table,
  index,
  t,
  onChange,
  onSave,
  onInsert,
}: {
  table: ParsedTable;
  index: number;
  t: (k: string) => string;
  onChange: (patch: Partial<ParsedTable>) => void;
  onSave: () => void;
  onInsert: () => void;
}): JSX.Element {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-white">
      <div className="px-3 py-2 border-b border-border space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-primary">
            {t('tbl_word_table')} {index} ({table.rows.length}×{table.rows[0]?.length ?? 0})
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-secondary">
            <input
              type="checkbox"
              checked={table.hasHeader}
              onChange={(e) => onChange({ hasHeader: e.target.checked })}
            />
            {t('tbl_first_row_header')}
          </label>
        </div>
        <input
          type="text"
          value={table.title ?? ''}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t('tbl_title_placeholder')}
          className="w-full text-xs px-2 py-1.5 border border-border rounded"
        />
        <textarea
          value={table.footnote ?? ''}
          onChange={(e) => onChange({ footnote: e.target.value })}
          placeholder={t('tbl_footnote_placeholder')}
          className="w-full min-h-12 resize-y text-xs px-2 py-1.5 border border-border rounded"
        />
      </div>
      <TableRowsPreview rows={table.rows} hasHeader={table.hasHeader} />
      <div className="px-3 py-2 border-t border-border flex justify-end gap-2">
        <button onClick={onSave} className="text-xs px-2 py-1 border border-teal text-teal hover:bg-teal-bg rounded font-semibold">
          {t('tbl_save_to_memory')}
        </button>
        <button onClick={onInsert} className="text-xs px-2 py-1 bg-teal text-white rounded hover:bg-teal-dark font-semibold">
          {t('tbl_insert_to_editor')}
        </button>
      </div>
    </div>
  );
}

function TableRowsPreview({
  rows,
  hasHeader,
}: {
  rows: string[][];
  hasHeader: boolean;
}): JSX.Element {
  return (
    <div className="overflow-auto max-h-72">
      <table className="text-[10px] border-collapse w-full">
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={ri === 0 && hasHeader ? 'font-semibold bg-slate-50 border-b border-border' : ''}
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 border-b border-border/50 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] px-2 py-1 border border-border rounded hover:bg-slate-50 hover:text-teal"
    >
      {label}
    </button>
  );
}
