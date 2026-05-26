'use client';

import type { Ref } from '@/store/types';
import { formatBibEntry, orderRefsForBib, type CitationStyle } from '@/lib/refs/styles';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  refs: Ref[];
  refOrder: Map<string, number>;
  style: CitationStyle;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
};

export function BibliographyPreview({
  refs,
  refOrder,
  style,
  selectedId,
  onSelect,
}: Props): JSX.Element {
  const { t } = useLang();
  // Use the cited-order map; refs not cited go to the end in their array order.
  const cited = refs
    .filter((r) => refOrder.get(r.id) != null)
    .sort((a, b) => (refOrder.get(a.id) ?? 0) - (refOrder.get(b.id) ?? 0));
  const uncited = refs.filter((r) => refOrder.get(r.id) == null);
  const orderedForBib = orderRefsForBib(style, cited);

  return (
    <div className="card flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h3 className="text-sm font-bold text-primary">{t('bib_title')}</h3>
        <span className="text-xs text-muted">
          {t('bib_cited_count').replace('{cited}', String(cited.length)).replace('{uncited}', String(uncited.length))}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3 text-sm leading-relaxed">
        {refs.length === 0 ? (
          <p className="text-muted text-center py-6">{t('bib_no_refs')}</p>
        ) : (
          <>
            {orderedForBib.length > 0 ? (
              <ol className="space-y-1.5">
                {orderedForBib.map((r, i) => {
                  const n = refOrder.get(r.id) ?? i + 1;
                  const isSelected = selectedId === r.id;
                  return (
                    <li
                      key={r.id}
                      onClick={() => onSelect?.(r.id)}
                      className={`cursor-pointer rounded px-2 py-1.5 text-secondary ${
                        isSelected ? 'bg-teal-bg text-primary font-medium' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-faint text-xs mr-1">#{n}</span>
                      {formatBibEntry(style, r, n)}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-muted italic text-xs">{t('bib_no_citations')}</p>
            )}

            {uncited.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  {t('bib_uncited')}
                </div>
                <ul className="space-y-1.5 opacity-70">
                  {uncited.map((r) => {
                    const isSelected = selectedId === r.id;
                    return (
                      <li
                        key={r.id}
                        onClick={() => onSelect?.(r.id)}
                        className={`cursor-pointer rounded px-2 py-1.5 text-secondary ${
                          isSelected ? 'bg-teal-bg text-primary font-medium' : 'hover:bg-slate-50'
                        }`}
                      >
                        {r.title || r.raw?.slice(0, 80) || t('rp_no_title')} —{' '}
                        <span className="text-faint text-xs">
                          {r.authors[0]?.family ?? '—'}
                          {r.year ? `, ${r.year}` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
