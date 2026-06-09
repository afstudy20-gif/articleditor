'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseTable, tiptapTableToRows, rowsToTiptapTable, type ParsedTable } from '@/lib/tables/parse-table';
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
  node: any;
}

interface TablePanelProps {
  editor: any;
  onClose: () => void;
  t: (k: string) => string;
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
      items.push({ pos, index: tableIndex, rows, hasHeader, node });
      return false; // don't descend into table
    }
    return true;
  });
  return items;
}

function rowsToPlainText(rows: string[][]): string {
  return rows.map((r) => r.join('\t')).join('\n');
}

// ─── Main Panel ─────────────────────────────────────────────

export function TablePanel({ editor, onClose, t }: TablePanelProps): JSX.Element {
  const [tables, setTables] = useState<TableEntry[]>(() => collectTables(editor));
  const [view, setView] = useState<ViewMode>('list');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<ParsedTable | null>(null);
  const [exportStyle, setExportStyle] = useState<TableStyle>('three-line');
  const [exportTitle, setExportTitle] = useState('');
  const [exportFootnote, setExportFootnote] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Refresh table list on editor changes
  useEffect(() => {
    if (!editor) return undefined;
    const refresh = () => setTables(collectTables(editor));
    editor.on('update', refresh);
    refresh();
    return () => editor.off('update', refresh);
  }, [editor]);

  // ─── Import ───────────────────────────────────────────────

  const handleImportTextChange = useCallback((text: string) => {
    setImportText(text);
    const parsed = parseTable(text);
    setImportPreview(parsed);
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    // Try HTML first (Word/Excel clipboard)
    const html = e.clipboardData.getData('text/html');
    if (html && /<table/i.test(html)) {
      e.preventDefault();
      const parsed = parseTable(html);
      if (parsed) {
        setImportPreview(parsed);
        setImportText(rowsToPlainText(parsed.rows));
        return;
      }
    }
    // Fall through to plain text handling via onChange
  }, []);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setImportText(text);
      setImportPreview(parseTable(text));
    };
    reader.readAsText(file);
  }, []);

  const insertImportedTable = useCallback(() => {
    if (!importPreview || !editor) return;
    const tableJson = rowsToTiptapTable(importPreview.rows, importPreview.hasHeader);
    if (!tableJson) return;
    editor.chain().focus().insertContent(tableJson).run();
    setView('list');
    setImportText('');
    setImportPreview(null);
  }, [importPreview, editor]);

  // ─── Export ───────────────────────────────────────────────

  const activeTable = editIndex !== null ? tables.find((t) => t.index === editIndex) : null;

  const exportOpts = useCallback(
    (tbl: TableEntry): StyledTableOptions => ({
      style: exportStyle,
      title: exportTitle || `Table ${tbl.index}`,
      footnote: exportFootnote || undefined,
      hasHeader: tbl.hasHeader,
    }),
    [exportStyle, exportTitle, exportFootnote],
  );

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
          {tables.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-xs text-muted mb-3">{t('tbl_empty')}</p>
              <button
                onClick={() => setView('import')}
                className="text-xs text-teal hover:underline"
              >
                {t('tbl_import_hint')}
              </button>
            </div>
          ) : (
            tables.map((tbl) => (
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
                      onClick={() => { setEditIndex(tbl.index); setView('edit'); }}
                      className="text-[10px] text-secondary hover:text-primary"
                    >
                      {t('tbl_export')}
                    </button>
                  </div>
                </div>

                {/* Inline mini preview */}
                <div className="px-3 pb-2 overflow-x-auto">
                  <table className="text-[9px] border-collapse w-full">
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
                  </table>
                </div>
              </div>
            ))
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
              value={exportTitle}
              onChange={(e) => setExportTitle(e.target.value)}
              className="w-full text-xs px-2 py-1 border border-border rounded"
            />
            <input
              type="text"
              placeholder={t('tbl_footnote_placeholder')}
              value={exportFootnote}
              onChange={(e) => setExportFootnote(e.target.value)}
              className="w-full text-xs px-2 py-1 border border-border rounded"
            />
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
                className="text-xs px-2 py-1 border border-border rounded hover:bg-slate-50"
              >
                📂 {t('tbl_import_file')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,.html,.htm"
                className="hidden"
                onChange={handleFileImport}
              />
              {importPreview && (
                <span className="text-[10px] text-teal">
                  ✓ {importPreview.rows.length}×{importPreview.rows[0]?.length ?? 0} ({importPreview.format})
                </span>
              )}
            </div>
          </div>

          {/* Import preview */}
          {importPreview && (
            <div className="px-3 py-2 border-t border-border">
              <div className="text-[10px] text-muted font-semibold mb-1">{t('tbl_preview')}</div>
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

              <button
                onClick={insertImportedTable}
                className="mt-2 w-full text-xs px-3 py-1.5 bg-teal text-white rounded hover:bg-teal-dark font-semibold"
              >
                {t('tbl_insert_to_editor')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Small components ───────────────────────────────────────

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
