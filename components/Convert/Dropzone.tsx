'use client';

import { useRef, useState } from 'react';
import { useLang } from '@/lib/i18n/hooks';

type Props = {
  onFile: (file: File) => void;
};

export function Dropzone({ onFile }: Props) {
  const { lang } = useLang();
  const tr = lang === 'tr';
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`card p-8 text-center cursor-pointer transition ${
        drag ? 'border-teal bg-teal-bg' : 'hover:bg-slate-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div className="text-4xl mb-2">📄</div>
      <p className="font-semibold text-primary">{tr ? '.docx dosyasını buraya bırak veya tıkla' : 'Drop a .docx file here or click'}</p>
      <p className="text-xs text-muted mt-1">{tr ? 'Belge tarayıcıda işlenir; sunucuya yüklenmez.' : 'The document is processed in your browser; nothing is uploaded.'}</p>
    </div>
  );
}
