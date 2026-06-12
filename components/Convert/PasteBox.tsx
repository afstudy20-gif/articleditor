'use client';

import { useState } from 'react';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  onSubmit: (text: string, html?: string) => void;
};

export function PasteBox({ onSubmit }: Props) {
  const { lang } = useLang();
  const tr = lang === 'tr';
  const [text, setText] = useState('');
  const [html, setHtml] = useState<string>();
  return (
    <div className="card p-4">
      <label className="tool-label block mb-2">{tr ? 'Metin yapıştır' : 'Paste text'}</label>
      <textarea
        className="w-full min-h-[200px] font-mono text-sm border border-border rounded-lg p-3 outline-none focus:border-teal focus:ring-2 focus:ring-teal/10"
        placeholder={tr ? 'Belge metnini yapıştır. Kaynakça bölümü otomatik algılanacak.' : 'Paste the document text. The reference section will be detected automatically.'}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setHtml(undefined);
        }}
        onPaste={(event) => {
          const richHtml = event.clipboardData.getData('text/html');
          if (!richHtml) return;
          event.preventDefault();
          setText(event.clipboardData.getData('text/plain'));
          setHtml(richHtml);
        }}
      />
      <div className="mt-3 flex justify-end">
        <button
          className="btn-primary"
          disabled={text.trim().length < 20}
          onClick={() => onSubmit(text, html)}
        >
          {tr ? 'Algıla & Önizle' : 'Detect & Preview'}
        </button>
      </div>
    </div>
  );
}
