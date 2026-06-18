'use client';

/**
 * Small progress chip for RAG ingestion. Renders an ascii block bar plus a
 * `{current}/{total}` count, or — in compact mode — just a rounded percentage.
 *
 * The bar uses 6 fixed cells so the layout is stable regardless of magnitude:
 * `▰▰▰▱▱▱`. Filled cells take the `teal` accent, empty ones fall back to muted.
 */
type Props = {
  current: number;
  total: number;
  label?: string;
  /** Small inline mode: shows only a rounded percentage (e.g. `45%`). */
  compact?: boolean;
};

const CELLS = 6;

export function IngestProgress({ current, total, label, compact }: Props): JSX.Element {
  const ratio = total > 0 ? Math.min(Math.max(current / total, 0), 1) : 0;

  if (compact) {
    return (
      <span className="text-[11px] text-secondary tabular-nums" aria-label={label}>
        {Math.round(ratio * 100)}%
      </span>
    );
  }

  const filled = Math.round(ratio * CELLS);
  const bar = `${'▰'.repeat(filled)}${'▱'.repeat(CELLS - filled)}`;

  return (
    <span className="text-[11px] text-secondary tabular-nums" aria-label={label}>
      {label ? <span className="text-muted">{label} </span> : null}
      <span className="text-teal">{bar}</span>
      <span className="ml-1">
        {current}/{total}
      </span>
    </span>
  );
}
