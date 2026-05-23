'use client';

import type { Ref } from '@/store/types';

type Props = {
  reference: Ref | null;
  number?: number;
};

export function RefDetail({ reference: r, number }: Props): JSX.Element {
  if (!r) {
    return (
      <div className="card p-6 text-sm text-muted text-center">
        Bir referansı seçince detayı burada görünecek.
      </div>
    );
  }

  const authorStr = r.authors
    .map((a) => {
      if (a.literal) return a.literal;
      const fam = a.family ?? '';
      const giv = a.given ?? '';
      return [fam, giv].filter(Boolean).join(', ');
    })
    .filter(Boolean)
    .join('; ');

  return (
    <div className="card p-4 max-h-full overflow-auto">
      <div className="flex items-center gap-2 mb-3">
        {number != null && (
          <span className="w-8 h-8 rounded-md bg-teal text-white font-bold text-sm flex items-center justify-center">
            {number}
          </span>
        )}
        <span className="text-xs uppercase tracking-wider text-muted font-semibold">Referans detayı</span>
      </div>

      <h4 className="text-sm font-bold text-primary leading-snug mb-3">{r.title || '(Başlık yok)'}</h4>

      <dl className="text-xs space-y-2">
        {authorStr && <Field label="Yazarlar" value={authorStr} />}
        {r.containerTitle && <Field label="Dergi / kaynak" value={r.containerTitle} />}
        <div className="flex flex-wrap gap-3">
          {r.year && <MiniField label="Yıl" value={String(r.year)} />}
          {r.volume && <MiniField label="Cilt" value={r.volume} />}
          {r.issue && <MiniField label="Sayı" value={r.issue} />}
          {r.pages && <MiniField label="Sayfa" value={r.pages} />}
        </div>
        {r.publisher && <Field label="Yayıncı" value={r.publisher} />}
        {r.doi && (
          <Field
            label="DOI"
            value={
              <a
                href={`https://doi.org/${r.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:underline break-all"
              >
                {r.doi}
              </a>
            }
          />
        )}
        {r.pmid && (
          <Field
            label="PMID"
            value={
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:underline"
              >
                {r.pmid}
              </a>
            }
          />
        )}
        {r.url && !r.doi && (
          <Field
            label="URL"
            value={
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:underline break-all"
              >
                {r.url}
              </a>
            }
          />
        )}
        {r.confidence != null && <Field label="Parser güveni" value={`${Math.round(r.confidence * 100)}%`} />}
      </dl>

      {r.userNote && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="tool-label mb-1.5 flex items-center gap-1">
            <span>📝 Notum</span>
          </div>
          <p className="text-xs text-secondary leading-relaxed whitespace-pre-wrap bg-teal-bg/30 border border-teal/20 rounded p-2">
            {r.userNote}
          </p>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border">
        <div className="tool-label mb-1.5">Özet</div>
        {r.abstract ? (
          <p className="text-xs text-secondary leading-relaxed whitespace-pre-wrap">{r.abstract}</p>
        ) : (
          <p className="text-xs text-faint italic">
            Açık erişimli özet bulunamadı. DOI tara ile CrossRef/OpenAlex/PubMed'den çekilebilir.
          </p>
        )}
      </div>

      {r.raw && (
        <details className="mt-4 pt-3 border-t border-border">
          <summary className="tool-label cursor-pointer hover:text-teal">Orijinal satır</summary>
          <p className="text-xs text-muted font-mono mt-2 leading-relaxed whitespace-pre-wrap break-words">{r.raw}</p>
        </details>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div>
      <dt className="tool-label">{label}</dt>
      <dd className="text-secondary mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="tool-label">{label}</dt>
      <dd className="text-primary font-semibold mt-0.5">{value}</dd>
    </div>
  );
}
