'use client';

import { useLang } from '@/lib/i18n/hooks';

/**
 * Inline citation chip rendered for `[chunk_id]` markers in an assistant
 * message. Shows a 1-based reference number (and page when known) and, when
 * `onClick` is provided, opens the underlying source via the panel callback.
 *
 * The chip is keyboard-focusable so the citation flow stays accessible.
 */
type Props = {
  chunkId: string;
  refNumber?: number;
  refId?: string;
  pageNo?: number;
  sourceTitle?: string;
  onClick?: () => void;
};

export function CitationChip({
  chunkId,
  refNumber,
  pageNo,
  sourceTitle,
  onClick,
}: Props): JSX.Element {
  const { t } = useLang();
  const label = formatLabel(refNumber, pageNo);
  const interactive = typeof onClick === 'function';

  const className = interactive
    ? 'inline-flex items-center rounded px-1 mx-0.5 align-baseline text-[11px] font-semibold leading-tight text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 hover:text-teal-800 cursor-pointer transition-colors'
    : 'inline-flex items-center rounded px-1 mx-0.5 align-baseline text-[11px] font-semibold leading-tight text-muted bg-border/40 border border-transparent';

  const title = sourceTitle
    ? sourceTitle
    : chunkId;

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={`${t('rag_cite_open')} — ${title}`}
        className={className}
      >
        {label}
      </button>
    );
  }

  return (
    <span className={className} title={title} aria-label={title}>
      {label}
    </span>
  );
}

function formatLabel(refNumber: number | undefined, pageNo: number | undefined): string {
  const refPart = refNumber && refNumber > 0 ? String(refNumber) : '?';
  if (pageNo && pageNo > 0) {
    return `[${refPart}, s.${pageNo}]`;
  }
  return `[${refPart}]`;
}
