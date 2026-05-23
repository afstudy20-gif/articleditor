'use client';

import { useState } from 'react';

type Props = {
  onSubmit: (text: string) => void;
};

export function PasteBox({ onSubmit }: Props) {
  const [text, setText] = useState('');
  return (
    <div className="card p-4">
      <label className="tool-label block mb-2">Metin yapıştır</label>
      <textarea
        className="w-full min-h-[200px] font-mono text-sm border border-border rounded-lg p-3 outline-none focus:border-teal focus:ring-2 focus:ring-teal/10"
        placeholder="Belge metnini yapıştır. Kaynakça bölümü otomatik algılanacak."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-3 flex justify-end">
        <button
          className="btn-primary"
          disabled={text.trim().length < 20}
          onClick={() => onSubmit(text)}
        >
          Algıla & Önizle
        </button>
      </div>
    </div>
  );
}
