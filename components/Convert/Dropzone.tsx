'use client';

import { useRef, useState } from 'react';

type Props = {
  onFile: (file: File) => void;
};

export function Dropzone({ onFile }: Props) {
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
      <p className="font-semibold text-primary">.docx dosyasını buraya bırak veya tıkla</p>
      <p className="text-xs text-muted mt-1">Belge tarayıcıda işlenir; sunucuya yüklenmez.</p>
    </div>
  );
}
